/**
 * Banco Sandbox — servidor SIMULADO, inspirado no Open Finance Brasil.
 *
 * Imita o que o OpenWallet precisa de um provedor de dados:
 *  - consentimento (criar, autorizar numa tela própria, consultar, revogar)
 *  - contas de cartão de crédito e suas transações (formato próximo ao da especificação,
 *    com valor em string, creditDebitType, transactionType e payeeMCC)
 *  - webhooks assinados quando surgem transações novas, como fazem os agregadores
 *    (Pluggy, Belvo...). O Open Finance oficial não envia webhooks de transação.
 *
 * Dados ficam em memória: reiniciar o servidor apaga tudo. É só para desenvolvimento e demo.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac, randomUUID } from 'node:crypto';
import { randomInt, randomMerchant } from './data.js';

export interface MockOptions {
  /** URL pública deste servidor (usada nos links de autorização). */
  publicUrl: string;
  /** Chave que o OpenWallet usa para chamar este servidor. */
  apiKey: string;
  /** Para onde mandar os webhooks. Vazio = não envia. */
  webhookUrl?: string;
  /** Segredo compartilhado da assinatura HMAC dos webhooks. */
  webhookSecret: string;
  /** Gera uma compra nova a cada N ms para cada consentimento ativo. 0 = desliga. */
  simulateIntervalMs?: number;
  /** Quantos dias de histórico gerar ao autorizar. */
  backfillDays?: number;
  logger?: boolean;
}

type ConsentStatus = 'AWAITING_AUTHORISATION' | 'AUTHORISED' | 'REJECTED' | 'REVOKED';

interface Consent {
  consentId: string;
  status: ConsentStatus;
  permissions: string[];
  redirectUri: string;
  state: string;
  creationDateTime: string;
  statusUpdateDateTime: string;
  accountId: string;
}

export interface CardTransaction {
  transactionId: string;
  identificationNumber: string;
  transactionName: string;
  billId: string;
  creditDebitType: 'DEBITO' | 'CREDITO';
  transactionType: 'OUTROS' | 'PAGAMENTO' | 'ESTORNO' | 'TARIFA' | 'CASHBACK';
  amount: { amount: string; currency: 'BRL' };
  transactionDateTime: string;
  billPostDate: string;
  payeeMCC: number | null;
  /** Extensão do sandbox (não existe na especificação): qual compra este estorno anula. */
  sandboxReversalOf?: string;
}

interface Account {
  creditCardAccountId: string;
  brandName: string;
  companyCnpj: string;
  name: string;
  productType: string;
  creditCardNetwork: string;
  identificationNumber: string;
  transactions: CardTransaction[];
}

const PERMISSIONS = [
  'CREDIT_CARDS_ACCOUNTS_READ',
  'CREDIT_CARDS_ACCOUNTS_TRANSACTIONS_READ',
  'RESOURCES_READ',
];

export type MockApp = FastifyInstance & {
  simulatePurchase: (consentId: string, o?: Partial<{ cents: number; mcc: number; name: string }>) => CardTransaction;
};

export function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const brl = (cents: number) => (cents / 100).toFixed(2);
const html = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function buildMockApp(opts: MockOptions): Promise<MockApp> {
  const app = Fastify({ logger: opts.logger ?? false });
  const consents = new Map<string, Consent>();
  const accounts = new Map<string, Account>();
  const deliveries: { eventId: string; status: 'delivered' | 'failed' | 'pending'; attempts: number }[] = [];

  // ---------- helpers ----------
  function requireKey(key: unknown) {
    if (key !== opts.apiKey) {
      const err = new Error('x-api-key inválida') as Error & { statusCode: number };
      err.statusCode = 401;
      throw err;
    }
  }

  function getConsent(id: string): Consent {
    const c = consents.get(id);
    if (!c) {
      const err = new Error('Consentimento não encontrado') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    return c;
  }

  function newPurchase(account: Account, when: Date, override: Partial<{ cents: number; mcc: number; name: string }> = {}): CardTransaction {
    const m = randomMerchant();
    const cents = override.cents ?? randomInt(m.min, m.max);
    return {
      transactionId: randomUUID(),
      identificationNumber: account.identificationNumber,
      transactionName: override.name ?? m.name,
      billId: `${when.getUTCFullYear()}${String(when.getUTCMonth() + 1).padStart(2, '0')}`,
      creditDebitType: 'DEBITO',
      transactionType: 'OUTROS',
      amount: { amount: brl(cents), currency: 'BRL' },
      transactionDateTime: when.toISOString(),
      billPostDate: isoDate(when),
      payeeMCC: override.mcc ?? m.mcc,
    };
  }

  /** Envia o webhook com tentativas e espera exponencial (1s, 2s, 4s...), como um provedor real. */
  async function sendWebhook(event: Record<string, unknown>) {
    if (!opts.webhookUrl) return;
    const eventId = randomUUID();
    const body = JSON.stringify({ eventId, createdAt: new Date().toISOString(), ...event });
    const record = { eventId, status: 'pending' as 'delivered' | 'failed' | 'pending', attempts: 0 };
    deliveries.unshift(record);
    deliveries.length = Math.min(deliveries.length, 200);

    for (let attempt = 0; attempt < 6; attempt++) {
      record.attempts++;
      try {
        const res = await fetch(opts.webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-ow-signature': signPayload(opts.webhookSecret, body) },
          body,
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
          record.status = 'delivered';
          return;
        }
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break; // erro do cliente: não insiste
      } catch {
        /* rede: tenta de novo */
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    record.status = 'failed';
    app.log.warn({ eventId }, 'webhook não entregue');
  }

  function notifyTransactions(consent: Consent, txs: CardTransaction[]) {
    if (!txs.length) return;
    const dates = txs.map((t) => t.transactionDateTime.slice(0, 10)).sort();
    void sendWebhook({
      event: 'transactions.created',
      consentId: consent.consentId,
      accountId: consent.accountId,
      fromDate: dates[0],
      toDate: dates[dates.length - 1],
      transactionIds: txs.map((t) => t.transactionId),
    });
  }

  function simulatePurchase(consentId: string, override: Partial<{ cents: number; mcc: number; name: string }> = {}) {
    const consent = getConsent(consentId);
    if (consent.status !== 'AUTHORISED') throw Object.assign(new Error('Consentimento não está autorizado'), { statusCode: 409 });
    const account = accounts.get(consent.accountId)!;
    const tx = newPurchase(account, new Date(), override);
    account.transactions.push(tx);
    notifyTransactions(consent, [tx]);
    return tx;
  }

  // ---------- consentimento ----------
  app.post('/open-banking/consents/v3/consents', async (req, reply) => {
    requireKey(req.headers['x-api-key']);
    const body = (req.body ?? {}) as { redirectUri?: string; state?: string; data?: { permissions?: string[] } };
    if (!body.redirectUri) return reply.status(400).send({ errors: [{ code: 'PARAMETRO_NAO_INFORMADO', detail: 'redirectUri' }] });
    const now = new Date().toISOString();
    const accountId = randomUUID();
    const consent: Consent = {
      consentId: `urn:sandbox:${randomUUID()}`,
      status: 'AWAITING_AUTHORISATION',
      permissions: body.data?.permissions ?? PERMISSIONS,
      redirectUri: body.redirectUri,
      state: body.state ?? '',
      creationDateTime: now,
      statusUpdateDateTime: now,
      accountId,
    };
    consents.set(consent.consentId, consent);
    accounts.set(accountId, {
      creditCardAccountId: accountId,
      brandName: 'Banco Sandbox',
      companyCnpj: '00000000000191',
      name: 'Cartão Sandbox Platinum',
      productType: 'PLATINUM',
      creditCardNetwork: 'OUTRAS',
      identificationNumber: String(randomInt(1000, 9999)),
      transactions: [],
    });
    return reply.status(201).send({
      data: { consentId: consent.consentId, status: consent.status, creationDateTime: now, permissions: consent.permissions },
      links: { authorize: `${opts.publicUrl}/authorize?consent_id=${encodeURIComponent(consent.consentId)}` },
    });
  });

  app.get('/open-banking/consents/v3/consents/:consentId', async (req) => {
    requireKey(req.headers['x-api-key']);
    const c = getConsent((req.params as { consentId: string }).consentId);
    return { data: { consentId: c.consentId, status: c.status, permissions: c.permissions, creationDateTime: c.creationDateTime, statusUpdateDateTime: c.statusUpdateDateTime } };
  });

  app.delete('/open-banking/consents/v3/consents/:consentId', async (req, reply) => {
    requireKey(req.headers['x-api-key']);
    const c = getConsent((req.params as { consentId: string }).consentId);
    c.status = 'REVOKED';
    c.statusUpdateDateTime = new Date().toISOString();
    return reply.status(204).send();
  });

  // ---------- tela de autorização (o "app do banco") ----------
  app.get('/authorize', async (req, reply) => {
    const id = (req.query as { consent_id?: string }).consent_id ?? '';
    const c = consents.get(id);
    if (!c) return reply.status(404).type('text/html').send('<p>Consentimento não encontrado.</p>');
    const link = (d: string) => `/authorize/decision?consent_id=${encodeURIComponent(id)}&decision=${d}`;
    return reply.type('text/html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Banco Sandbox — autorizar</title>
<style>body{font-family:system-ui,sans-serif;background:#eef1f5;margin:0;display:grid;place-items:center;min-height:100vh}
.c{background:#fff;max-width:380px;padding:28px;border-radius:16px;box-shadow:0 8px 30px #0002}
.tag{display:inline-block;background:#ffe9a8;color:#6b4b00;font-size:12px;padding:3px 8px;border-radius:99px;font-weight:600}
h1{font-size:20px;margin:12px 0 4px}ul{padding-left:18px;color:#333}a{display:block;text-align:center;padding:12px;border-radius:10px;text-decoration:none;margin-top:10px;font-weight:600}
.ok{background:#3b5bdb;color:#fff}.no{color:#555;border:1px solid #ccc}</style></head><body><div class="c">
<span class="tag">AMBIENTE DE TESTE · dados fictícios</span>
<h1>Banco Sandbox</h1><p>O <b>OpenWallet</b> quer acessar, por 12 meses:</p>
<ul>${c.permissions.map((p) => `<li>${html(p)}</li>`).join('')}</ul>
<p style="color:#666;font-size:13px">Consentimento ${html(c.consentId)}</p>
<a class="ok" href="${link('approve')}">Autorizar</a><a class="no" href="${link('reject')}">Recusar</a>
</div></body></html>`);
  });

  app.get('/authorize/decision', async (req, reply) => {
    const q = req.query as { consent_id?: string; decision?: string };
    const c = getConsent(q.consent_id ?? '');
    if (c.status === 'AWAITING_AUTHORISATION') {
      c.status = q.decision === 'approve' ? 'AUTHORISED' : 'REJECTED';
      c.statusUpdateDateTime = new Date().toISOString();
      if (c.status === 'AUTHORISED') {
        // Histórico inicial: ~1 compra por dia nos últimos N dias + um pagamento de fatura.
        const account = accounts.get(c.accountId)!;
        const days = opts.backfillDays ?? 30;
        const txs: CardTransaction[] = [];
        for (let d = days; d >= 1; d--) {
          const n = randomInt(0, 2);
          for (let i = 0; i < n; i++) {
            const when = new Date(Date.now() - d * 86_400_000 + randomInt(8, 21) * 3_600_000);
            txs.push(newPurchase(account, when));
          }
        }
        const payDay = new Date(Date.now() - Math.min(days, 10) * 86_400_000);
        txs.push({
          ...newPurchase(account, payDay),
          transactionName: 'PAGAMENTO DE FATURA',
          creditDebitType: 'CREDITO',
          transactionType: 'PAGAMENTO',
          payeeMCC: null,
        });
        account.transactions.push(...txs);
        // Avisa depois do redirect, como um agregador que termina a coleta em segundo plano.
        setTimeout(() => notifyTransactions(c, txs), 500).unref();
      }
    }
    const url = new URL(c.redirectUri);
    url.searchParams.set('consent_id', c.consentId);
    url.searchParams.set('state', c.state);
    url.searchParams.set('status', c.status);
    return reply.redirect(url.toString());
  });

  // ---------- dados de cartão ----------
  function authorisedConsent(headers: Record<string, unknown>): Consent {
    requireKey(headers['x-api-key']);
    const c = getConsent(String(headers['x-consent-id'] ?? ''));
    if (c.status !== 'AUTHORISED') throw Object.assign(new Error('Consentimento não autorizado'), { statusCode: 403 });
    return c;
  }

  app.get('/open-banking/credit-cards-accounts/v2/accounts', async (req) => {
    const c = authorisedConsent(req.headers);
    const a = accounts.get(c.accountId)!;
    const { transactions: _t, ...pub } = a;
    return { data: [pub], meta: { totalRecords: 1, totalPages: 1 } };
  });

  app.get('/open-banking/credit-cards-accounts/v2/accounts/:accountId/transactions', async (req, reply) => {
    const c = authorisedConsent(req.headers);
    const { accountId } = req.params as { accountId: string };
    if (accountId !== c.accountId) return reply.status(404).send({ errors: [{ code: 'NAO_ENCONTRADO' }] });
    const q = req.query as Record<string, string | undefined>;
    const from = q.fromTransactionDate ?? '0000-01-01';
    const to = q.toTransactionDate ?? '9999-12-31';
    const size = Math.min(Number(q['page-size'] ?? 25), 1000);
    const page = Math.max(Number(q.page ?? 1), 1);
    const all = accounts
      .get(accountId)!
      .transactions.filter((t) => t.transactionDateTime.slice(0, 10) >= from && t.transactionDateTime.slice(0, 10) <= to)
      .sort((a, b) => a.transactionDateTime.localeCompare(b.transactionDateTime));
    const totalPages = Math.max(1, Math.ceil(all.length / size));
    const base = `/open-banking/credit-cards-accounts/v2/accounts/${accountId}/transactions?fromTransactionDate=${from}&toTransactionDate=${to}&page-size=${size}`;
    return {
      data: all.slice((page - 1) * size, page * size),
      links: { self: `${base}&page=${page}`, ...(page < totalPages ? { next: `${base}&page=${page + 1}` } : {}) },
      meta: { totalRecords: all.length, totalPages },
    };
  });

  // ---------- controles do simulador ----------
  app.post('/sandbox/purchase', async (req) => {
    const b = (req.body ?? {}) as { consentId?: string; amountCents?: number; mcc?: number; name?: string };
    return { transaction: simulatePurchase(b.consentId ?? '', { cents: b.amountCents, mcc: b.mcc, name: b.name }) };
  });

  app.post('/sandbox/reversal', async (req) => {
    const b = (req.body ?? {}) as { consentId?: string; transactionId?: string };
    const c = getConsent(b.consentId ?? '');
    const account = accounts.get(c.accountId)!;
    const orig = account.transactions.find((t) => t.transactionId === b.transactionId);
    if (!orig) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 });
    const tx: CardTransaction = {
      ...orig,
      transactionId: randomUUID(),
      transactionName: `ESTORNO ${orig.transactionName}`,
      creditDebitType: 'CREDITO',
      transactionType: 'ESTORNO',
      transactionDateTime: new Date().toISOString(),
      sandboxReversalOf: orig.transactionId,
    };
    account.transactions.push(tx);
    notifyTransactions(c, [tx]);
    return { transaction: tx };
  });

  app.get('/', async (_req, reply) => {
    const rows = [...consents.values()]
      .map((c) => `<tr><td>${html(c.consentId)}</td><td>${c.status}</td><td>${accounts.get(c.accountId)!.transactions.length}</td></tr>`)
      .join('');
    const hooks = deliveries.slice(0, 20).map((d) => `<tr><td>${d.eventId}</td><td>${d.status}</td><td>${d.attempts}</td></tr>`).join('');
    return reply.type('text/html').send(`<!doctype html><meta charset="utf-8"><title>Banco Sandbox</title>
<body style="font-family:system-ui;padding:24px"><h1>Banco Sandbox (simulado)</h1>
<p>Webhook: ${html(opts.webhookUrl ?? '(desligado)')} · compra automática a cada ${opts.simulateIntervalMs ?? 0} ms</p>
<h2>Consentimentos</h2><table border=1 cellpadding=6><tr><th>id</th><th>status</th><th>transações</th></tr>${rows}</table>
<h2>Últimos webhooks</h2><table border=1 cellpadding=6><tr><th>evento</th><th>status</th><th>tentativas</th></tr>${hooks}</table>`);
  });

  app.get('/health', async () => ({ status: 'ok' }));

  // ---------- gerador automático ----------
  if (opts.simulateIntervalMs && opts.simulateIntervalMs > 0) {
    const timer = setInterval(() => {
      for (const c of consents.values()) {
        if (c.status === 'AUTHORISED' && Math.random() < 0.6) {
          try {
            simulatePurchase(c.consentId);
          } catch {
            /* ignora */
          }
        }
      }
    }, opts.simulateIntervalMs);
    timer.unref();
    app.addHook('onClose', async () => clearInterval(timer));
  }

  return Object.assign(app, { simulatePurchase }) as unknown as MockApp;
}
