import { calculateTax, categoryFromMcc, type TaxRatesTable, type UF } from '@openwallet/tax';
import type { Pool } from '../db/pool.js';
import type { Cache } from '../lib/cache.js';
import { enqueue } from '../lib/queue.js';
import type { CardTransaction, OpenFinanceProvider } from '../lib/openfinance-client.js';
import type { Logger } from '../lib/worker.js';

export interface OpenFinanceDeps {
  pool: Pool;
  provider: OpenFinanceProvider;
  providerName: string;
  rates: TaxRatesTable;
  cache: Pick<Cache, 'bumpUser'>;
  log: Logger;
  backfillDays: number;
}

export interface ConnectionRow {
  id: string;
  user_id: string;
  provider: string;
  consent_id: string;
  state: string;
  institution: string;
  status: 'pending' | 'active' | 'rejected' | 'revoked' | 'error';
  last_sync_at: Date | null;
  last_error: string | null;
  created_at: Date;
}

export const QUEUE_EVENT = 'openfinance.event';
export const QUEUE_SYNC = 'openfinance.sync';

export interface WebhookEvent {
  eventId: string;
  event: string;
  consentId: string;
  accountId?: string;
  fromDate?: string;
  toDate?: string;
}
export interface SyncJob {
  connectionId: string;
  accountId?: string;
  fromDate: string;
  toDate: string;
}

const spDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
const daysAgo = (n: number) => spDate(new Date(Date.now() - n * 86_400_000).toISOString());

/** "123.45" -> 12345 sem passar por float. */
export function amountToCents(amount: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new Error(`valor inválido do provedor: "${amount}"`);
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

/** Compra no cartão = débito que não é tarifa/pagamento. Pagamento de fatura, crédito e cashback não são consumo. */
export const isPurchase = (t: CardTransaction) => t.creditDebitType === 'DEBITO' && t.transactionType === 'OUTROS';
export const isReversal = (t: CardTransaction) => t.creditDebitType === 'CREDITO' && t.transactionType === 'ESTORNO';

export function createOpenFinanceService(deps: OpenFinanceDeps) {
  const { pool, provider, providerName, rates, log } = deps;

  async function getByConsent(consentId: string) {
    const { rows } = await pool.query<ConnectionRow>(
      'SELECT * FROM bank_connections WHERE provider = $1 AND consent_id = $2',
      [providerName, consentId],
    );
    return rows[0] ?? null;
  }

  async function setStatus(id: string, status: ConnectionRow['status'], error: string | null = null) {
    const { rows } = await pool.query<ConnectionRow>(
      `UPDATE bank_connections SET status = $2, last_error = $3, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, status, error],
    );
    return rows[0]!;
  }

  /** Confere com o provedor e ativa a conexão. Ao ativar, agenda a carga do histórico. */
  async function refreshConsent(conn: ConnectionRow): Promise<ConnectionRow> {
    if (conn.status !== 'pending') return conn;
    const status = await provider.getConsentStatus(conn.consent_id);
    if (status === 'AUTHORISED') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query<ConnectionRow>(
          `UPDATE bank_connections SET status = 'active', updated_at = now()
            WHERE id = $1 AND status = 'pending' RETURNING *`,
          [conn.id],
        );
        if (rows[0]) {
          await enqueue(client, QUEUE_SYNC, {
            connectionId: conn.id, fromDate: daysAgo(deps.backfillDays), toDate: daysAgo(-1),
          } satisfies SyncJob);
        }
        await client.query('COMMIT');
        return rows[0] ?? { ...conn, status: 'active' };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
    if (status === 'REJECTED') return setStatus(conn.id, 'rejected');
    if (status === 'REVOKED') return setStatus(conn.id, 'revoked');
    return conn;
  }

  /** Busca as transações da janela e grava as compras como gastos (idempotente). */
  async function sync(job: SyncJob) {
    const { rows } = await pool.query<ConnectionRow & { uf: UF }>(
      `SELECT c.*, u.uf FROM bank_connections c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [job.connectionId],
    );
    const conn = rows[0];
    if (!conn || conn.status !== 'active') {
      log.info({ connectionId: job.connectionId, status: conn?.status }, 'conexão inativa, sync ignorado');
      return;
    }
    const accountIds = job.accountId ? [job.accountId] : await provider.listCardAccountIds(conn.consent_id);
    let inserted = 0;
    let removed = 0;

    for (const accountId of accountIds) {
      for await (const page of provider.listCardTransactions(conn.consent_id, accountId, job.fromDate, job.toDate)) {
        inserted += await insertPurchases(conn, page.filter(isPurchase));
        const reversed = page.filter(isReversal).map((t) => t.sandboxReversalOf).filter((x): x is string => !!x);
        if (reversed.length) {
          const r = await pool.query(
            `DELETE FROM expenses WHERE user_id = $1 AND external_id = ANY($2::text[])`,
            [conn.user_id, reversed],
          );
          removed += r.rowCount ?? 0;
        }
      }
    }
    await pool.query(
      `UPDATE bank_connections SET last_sync_at = now(), last_error = NULL, updated_at = now() WHERE id = $1`,
      [conn.id],
    );
    if (inserted || removed) await deps.cache.bumpUser(conn.user_id);
    log.info({ connectionId: conn.id, inserted, removed }, 'sync Open Finance concluído');
  }

  /** Insere em lote com unnest: uma ida ao banco por página, não uma por transação. */
  async function insertPurchases(conn: ConnectionRow & { uf: UF }, txs: CardTransaction[]): Promise<number> {
    if (!txs.length) return 0;
    const cols = {
      amount: [] as number[], category: [] as string[], description: [] as string[], spentOn: [] as string[],
      fed: [] as number[], est: [] as number[], mun: [] as number[], total: [] as number[], rate: [] as number[],
      externalId: [] as string[], mcc: [] as (number | null)[],
    };
    for (const t of txs) {
      const amountCents = amountToCents(t.amount.amount);
      if (amountCents <= 0) continue;
      // O Open Finance não informa a UF do estabelecimento; usamos a do perfil (o usuário pode corrigir).
      const tax = calculateTax(rates, { amountCents, category: categoryFromMcc(t.payeeMCC), uf: conn.uf });
      cols.amount.push(amountCents);
      cols.category.push(tax.category);
      cols.description.push(t.transactionName.slice(0, 200));
      cols.spentOn.push(spDate(t.transactionDateTime));
      cols.fed.push(tax.federalCents);
      cols.est.push(tax.estadualCents);
      cols.mun.push(tax.municipalCents);
      cols.total.push(tax.totalCents);
      cols.rate.push(tax.ratePct);
      cols.externalId.push(t.transactionId);
      cols.mcc.push(t.payeeMCC);
    }
    const r = await pool.query(
      `INSERT INTO expenses (user_id, connection_id, source, uf, rates_version,
         amount_cents, category, description, spent_on, tax_federal_cents, tax_estadual_cents,
         tax_municipal_cents, tax_total_cents, tax_rate_pct, external_id, mcc)
       SELECT $1, $2, 'openfinance', $3, $4, t.*
         FROM unnest($5::bigint[], $6::text[], $7::text[], $8::date[], $9::bigint[], $10::bigint[],
                     $11::bigint[], $12::bigint[], $13::numeric[], $14::text[], $15::int[])
              AS t(amount, category, description, spent_on, fed, est, mun, total, rate, external_id, mcc)
        WHERE NOT EXISTS (SELECT 1 FROM expense_tombstones x WHERE x.user_id = $1 AND x.external_id = t.external_id)
       ON CONFLICT (user_id, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
      [conn.user_id, conn.id, conn.uf, rates.version, cols.amount, cols.category, cols.description, cols.spentOn,
        cols.fed, cols.est, cols.mun, cols.total, cols.rate, cols.externalId, cols.mcc],
    );
    return r.rowCount ?? 0;
  }

  /** Trata um webhook já validado e persistido. */
  async function handleEvent(ev: WebhookEvent) {
    const conn = await getByConsent(ev.consentId);
    if (!conn) {
      log.warn({ consentId: ev.consentId, event: ev.event }, 'webhook de consentimento desconhecido');
      return;
    }
    switch (ev.event) {
      case 'transactions.created': {
        // O webhook pode chegar antes do usuário voltar para o app: confirma o consentimento aqui também.
        const active = await refreshConsent(conn);
        if (active.status !== 'active') return;
        await sync({
          connectionId: conn.id,
          accountId: ev.accountId,
          fromDate: ev.fromDate ?? daysAgo(3),
          toDate: ev.toDate ?? daysAgo(-1),
        });
        return;
      }
      case 'consent.revoked':
        await setStatus(conn.id, 'revoked');
        return;
      default:
        log.info({ event: ev.event }, 'evento ignorado');
    }
  }

  return {
    getByConsent,
    refreshConsent,
    sync,
    handleEvent,
    handlers: {
      [QUEUE_EVENT]: (p: WebhookEvent) => handleEvent(p),
      [QUEUE_SYNC]: (p: SyncJob) => sync(p),
    },
    daysAgo,
  };
}

export type OpenFinanceService = ReturnType<typeof createOpenFinanceService>;
