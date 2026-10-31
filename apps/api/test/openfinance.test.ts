import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRatesFile } from '@openwallet/tax/node';
import { buildMockApp, signPayload, type MockApp, type MockOptions } from '../../openfinance-mock/src/app.js';
import { SandboxOpenFinanceClient } from '../src/lib/openfinance-client.js';
import { createWorker } from '../src/lib/worker.js';
import { createOpenFinanceService, isPurchase } from '../src/services/openfinance.js';
import { registerUser, setup } from './helpers.js';

const SECRET = 'segredo-de-teste-do-webhook';
const silent = { info() {}, warn() {}, error() {} };

let mock: MockApp;
let mockOpts: MockOptions;
let mockUrl: string;
let ctx: Awaited<ReturnType<typeof setup>>;
let worker: ReturnType<typeof createWorker>;
let provider: SandboxOpenFinanceClient;

beforeAll(async () => {
  mockOpts = { publicUrl: '', apiKey: 'k', webhookSecret: SECRET, backfillDays: 10, simulateIntervalMs: 0 };
  mock = await buildMockApp(mockOpts);
  mockUrl = await mock.listen({ port: 0, host: '127.0.0.1' });
  mockOpts.publicUrl = mockUrl;

  provider = new SandboxOpenFinanceClient(mockUrl, 'k');
  ctx = await setup({
    provider,
    env: {
      OPENFINANCE_BASE_URL: mockUrl,
      OPENFINANCE_API_KEY: 'k',
      OPENFINANCE_WEBHOOK_SECRET: SECRET,
      OPENFINANCE_REDIRECT_URL: 'http://app.local/openfinance/callback',
      OPENFINANCE_BACKFILL_DAYS: '15',
    },
  });
  const apiUrl = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  mockOpts.webhookUrl = `${apiUrl}/v1/webhooks/openfinance`;

  const service = createOpenFinanceService({
    pool: ctx.pool, provider, providerName: 'sandbox', rates: loadRatesFile(),
    cache: ctx.app.cache, log: silent, backfillDays: 15,
  });
  worker = createWorker({ pool: ctx.pool, handlers: service.handlers, log: silent });
});

afterAll(async () => {
  await mock.close();
  await ctx.close();
});

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timeout esperando condição');
    await new Promise((r) => setTimeout(r, 100));
  }
}

const countWebhooks = async () => Number((await ctx.pool.query('SELECT count(*) FROM webhook_events')).rows[0].count);
const expensesOf = async (userId: string) =>
  (await ctx.pool.query('SELECT * FROM expenses WHERE user_id = $1 ORDER BY spent_on', [userId])).rows;

/** Espera o webhook chegar e o worker processar tudo. */
async function settle(webhooksBefore: number) {
  await waitFor(async () => (await countWebhooks()) > webhooksBefore);
  await worker.drain();
}

describe('Open Finance (com o Banco Sandbox)', () => {
  let user: Awaited<ReturnType<typeof registerUser>>;
  let connectionId: string;
  let consentId: string;

  it('conecta: consentimento → autorização no banco → callback → conexão ativa', async () => {
    user = await registerUser(ctx.app, 'RJ');
    const start = await ctx.app.inject({ method: 'POST', url: '/v1/openfinance/connections', headers: user.auth });
    expect(start.statusCode).toBe(201);
    const { authorizeUrl, connection } = start.json();
    expect(connection.status).toBe('pending');
    connectionId = connection.id;

    // Usuário clica em "Autorizar" na tela do banco.
    const page = await fetch(authorizeUrl);
    expect(await page.text()).toContain('Autorizar');
    const decision = await fetch(`${authorizeUrl.replace('/authorize?', '/authorize/decision?')}&decision=approve`, { redirect: 'manual' });
    const back = new URL(decision.headers.get('location')!);
    expect(back.origin + back.pathname).toBe('http://app.local/openfinance/callback');
    expect(back.searchParams.get('status')).toBe('AUTHORISED');
    consentId = back.searchParams.get('consent_id')!;

    const badState = await ctx.app.inject({
      method: 'POST', url: '/v1/openfinance/connections/callback', headers: user.auth,
      payload: { consentId, state: 'estado-falso' },
    });
    expect(badState.statusCode).toBe(400);

    const cb = await ctx.app.inject({
      method: 'POST', url: '/v1/openfinance/connections/callback', headers: user.auth,
      payload: { consentId, state: back.searchParams.get('state') },
    });
    expect(cb.statusCode).toBe(200);
    expect(cb.json().connection.status).toBe('active');
  });

  it('importa o histórico só com compras (sem pagamento de fatura) e calcula o imposto', async () => {
    await settle(0);
    await worker.drain();
    const [accountId] = await provider.listCardAccountIds(consentId);
    let purchases = 0;
    for await (const page of provider.listCardTransactions(consentId, accountId!, '2000-01-01', '2999-12-31')) {
      purchases += page.filter(isPurchase).length;
    }
    const rows = await expensesOf(user.user.id);
    expect(rows.length).toBe(purchases);
    expect(rows.every((r) => r.source === 'openfinance' && r.uf === 'RJ')).toBe(true);
    expect(rows.some((r) => r.description === 'PAGAMENTO DE FATURA')).toBe(false);
    expect(rows.every((r) => r.tax_total_cents > 0)).toBe(true);
  });

  it('nova compra no cartão chega por webhook e vira gasto categorizado pelo MCC', async () => {
    const before = await countWebhooks();
    const tx = mock.simulatePurchase(consentId, { cents: 10_000, mcc: 5541, name: 'POSTO TESTE' });
    await settle(before);
    const row = (await expensesOf(user.user.id)).find((r) => r.external_id === tx.transactionId);
    expect(row).toMatchObject({ category: 'combustivel', amount_cents: 10_000, description: 'POSTO TESTE' });

    const list = await ctx.app.inject({ url: '/v1/expenses?limit=100', headers: user.auth });
    const item = list.json().items.find((e: { description: string }) => e.description === 'POSTO TESTE');
    expect(item.source).toBe('openfinance');
    expect(item.mcc).toBe(5541);
  });

  it('webhook repetido não duplica e assinatura inválida ou antiga é recusada', async () => {
    const body = JSON.stringify({ eventId: 'evt-fixo-1', event: 'transactions.created', consentId, fromDate: '2026-01-01', toDate: '2026-12-31' });
    const send = (sig: string) => fetch(mockOpts.webhookUrl!, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ow-signature': sig }, body });

    const a = await send(signPayload(SECRET, body));
    const b = await send(signPayload(SECRET, body));
    expect(a.status).toBe(202);
    expect((await b.json()).duplicate).toBe(true);
    expect((await send(signPayload('outro-segredo', body))).status).toBe(401);
    expect((await send(signPayload(SECRET, body, Math.floor(Date.now() / 1000) - 3600))).status).toBe(401);
    await worker.drain();

    const ids = (await expensesOf(user.user.id)).map((r) => r.external_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('estorno no banco remove o gasto', async () => {
    let before = await countWebhooks();
    const tx = mock.simulatePurchase(consentId, { cents: 5_000, mcc: 5411 });
    await settle(before);
    before = await countWebhooks();
    await fetch(`${mockUrl}/sandbox/reversal`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consentId, transactionId: tx.transactionId }),
    });
    await settle(before);
    expect((await expensesOf(user.user.id)).some((r) => r.external_id === tx.transactionId)).toBe(false);
  });

  it('gasto importado apagado pelo usuário não volta na próxima sincronização', async () => {
    const row = (await expensesOf(user.user.id))[0];
    const del = await ctx.app.inject({ method: 'DELETE', url: `/v1/expenses/${row.id}`, headers: user.auth });
    expect(del.statusCode).toBe(204);
    const sync = await ctx.app.inject({ method: 'POST', url: `/v1/openfinance/connections/${connectionId}/sync`, headers: user.auth });
    expect(sync.statusCode).toBe(202);
    // sincroniza a janela inteira
    await ctx.pool.query(`UPDATE jobs SET payload = jsonb_set(payload, '{fromDate}', '"2000-01-01"') WHERE status = 'pending'`);
    await worker.drain();
    expect((await expensesOf(user.user.id)).some((r) => r.external_id === row.external_id)).toBe(false);
  });

  it('o resumo do impostômetro já inclui os gastos do banco', async () => {
    const rows = await expensesOf(user.user.id);
    const month = rows[rows.length - 1].spent_on.slice(0, 7);
    const expected = rows.filter((r) => r.spent_on.startsWith(month)).reduce((s, r) => s + r.tax_total_cents, 0);
    const s = await ctx.app.inject({ url: `/v1/impostometro/summary?month=${month}`, headers: user.auth });
    expect(s.json().totals.taxCents).toBe(expected);
  });

  it('desconectar revoga o consentimento no banco', async () => {
    const del = await ctx.app.inject({ method: 'DELETE', url: `/v1/openfinance/connections/${connectionId}`, headers: user.auth });
    expect(del.statusCode).toBe(204);
    expect(await provider.getConsentStatus(consentId)).toBe('REVOKED');
    const list = await ctx.app.inject({ url: '/v1/openfinance/connections', headers: user.auth });
    expect(list.json().connections[0].status).toBe('revoked');
  });

  it('outro usuário não vê nem mexe na conexão', async () => {
    const other = await registerUser(ctx.app);
    const list = await ctx.app.inject({ url: '/v1/openfinance/connections', headers: other.auth });
    expect(list.json().connections).toHaveLength(0);
    const sync = await ctx.app.inject({ method: 'POST', url: `/v1/openfinance/connections/${connectionId}/sync`, headers: other.auth });
    expect(sync.statusCode).toBe(404);
  });
});
