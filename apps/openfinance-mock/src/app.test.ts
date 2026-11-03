import { createHmac } from 'node:crypto';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMockApp, signPayload, type MockApp, type MockOptions } from './app.js';

const WEBHOOK = 'https://openwallet.test/webhook';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const key = { 'x-api-key': 'k' };
let app: MockApp;
const options = (o: Partial<MockOptions> = {}): MockOptions => ({
  publicUrl: 'https://banco.test',
  apiKey: 'k',
  webhookSecret: 's',
  backfillDays: 5,
  simulateIntervalMs: 0,
  ...o,
});

async function createConsent() {
  const res = await app.inject({
    method: 'POST',
    url: '/open-banking/consents/v3/consents',
    headers: key,
    payload: { redirectUri: 'https://app.test/cb', state: 'st' },
  });
  return res.json() as { data: { consentId: string; status: string }; links: { authorize: string } };
}

async function authorise(consentId: string, decision = 'approve') {
  return app.inject(`/authorize/decision?consent_id=${encodeURIComponent(consentId)}&decision=${decision}`);
}

const consentHeaders = (consentId: string) => ({ ...key, 'x-consent-id': consentId });

describe('Banco Sandbox', () => {
  beforeEach(async () => {
    app = await buildMockApp(options());
  });
  afterEach(async () => {
    await app.close();
  });

  describe('consentimento', () => {
    it('exige a chave de API', async () => {
      const res = await app.inject({ method: 'POST', url: '/open-banking/consents/v3/consents', payload: { redirectUri: 'x' } });
      expect(res.statusCode).toBe(401);
    });

    it('exige redirectUri', async () => {
      const res = await app.inject({ method: 'POST', url: '/open-banking/consents/v3/consents', headers: key, payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('nasce aguardando autorização, com link para a tela do banco', async () => {
      const { data, links } = await createConsent();
      expect(data.status).toBe('AWAITING_AUTHORISATION');
      expect(data.consentId).toMatch(/^urn:sandbox:/);
      expect(links.authorize).toBe(`https://banco.test/authorize?consent_id=${encodeURIComponent(data.consentId)}`);
    });

    it('a tela de autorização mostra as permissões e escapa HTML', async () => {
      const { data } = await createConsent();
      const page = await app.inject(`/authorize?consent_id=${encodeURIComponent(data.consentId)}`);
      expect(page.headers['content-type']).toMatch(/text\/html/);
      expect(page.body).toContain('CREDIT_CARDS_ACCOUNTS_TRANSACTIONS_READ');
      expect(page.body).toContain('AMBIENTE DE TESTE');
    });

    it('autorizar devolve o usuário ao app com consent_id, state e status', async () => {
      const { data } = await createConsent();
      const res = await authorise(data.consentId);
      expect(res.statusCode).toBe(302);
      const back = new URL(res.headers.location as string);
      expect(back.origin + back.pathname).toBe('https://app.test/cb');
      expect(Object.fromEntries(back.searchParams)).toEqual({ consent_id: data.consentId, state: 'st', status: 'AUTHORISED' });
    });

    it('recusar deixa o consentimento REJECTED e não libera dados', async () => {
      const { data } = await createConsent();
      await authorise(data.consentId, 'reject');
      const res = await app.inject({ url: '/open-banking/credit-cards-accounts/v2/accounts', headers: consentHeaders(data.consentId) });
      expect(res.statusCode).toBe(403);
    });

    it('a decisão é única: aprovar depois de recusar não muda nada', async () => {
      const { data } = await createConsent();
      await authorise(data.consentId, 'reject');
      const second = await authorise(data.consentId, 'approve');
      expect(new URL(second.headers.location as string).searchParams.get('status')).toBe('REJECTED');
    });

    it('revogar bloqueia o acesso aos dados', async () => {
      const { data } = await createConsent();
      await authorise(data.consentId);
      const del = await app.inject({ method: 'DELETE', url: `/open-banking/consents/v3/consents/${encodeURIComponent(data.consentId)}`, headers: key });
      expect(del.statusCode).toBe(204);
      const status = await app.inject({ url: `/open-banking/consents/v3/consents/${encodeURIComponent(data.consentId)}`, headers: key });
      expect(status.json().data.status).toBe('REVOKED');
    });

    it('consentimento inexistente → 404', async () => {
      const res = await app.inject({ url: '/open-banking/consents/v3/consents/urn:nada', headers: key });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('dados do cartão', () => {
    async function authorisedConsent() {
      const { data } = await createConsent();
      await authorise(data.consentId);
      const accounts = await app.inject({ url: '/open-banking/credit-cards-accounts/v2/accounts', headers: consentHeaders(data.consentId) });
      return { consentId: data.consentId, accountId: accounts.json().data[0].creditCardAccountId as string };
    }

    it('lista a conta sem expor as transações no corpo da conta', async () => {
      const { consentId } = await authorisedConsent();
      const res = await app.inject({ url: '/open-banking/credit-cards-accounts/v2/accounts', headers: consentHeaders(consentId) });
      expect(res.json().data[0]).toMatchObject({ brandName: 'Banco Sandbox', creditCardNetwork: expect.any(String) });
      expect(res.json().data[0]).not.toHaveProperty('transactions');
    });

    it('gera histórico com compras e um pagamento de fatura, no formato do Open Finance', async () => {
      const { consentId, accountId } = await authorisedConsent();
      const res = await app.inject({
        url: `/open-banking/credit-cards-accounts/v2/accounts/${accountId}/transactions?page-size=1000`,
        headers: consentHeaders(consentId),
      });
      const txs = res.json().data as any[];
      expect(txs.some((t) => t.transactionType === 'PAGAMENTO' && t.creditDebitType === 'CREDITO')).toBe(true);
      for (const t of txs) {
        expect(t.amount.amount).toMatch(/^\d{1,15}\.\d{2,4}$/);
        expect(t.amount.currency).toBe('BRL');
        expect(t.transactionDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(t.billPostDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['DEBITO', 'CREDITO']).toContain(t.creditDebitType);
      }
    });

    it('pagina de forma estável e ordenada, com link para a próxima página', async () => {
      const { consentId, accountId } = await authorisedConsent();
      for (let i = 0; i < 7; i++) app.simulatePurchase(consentId, { cents: 100 + i });
      const base = `/open-banking/credit-cards-accounts/v2/accounts/${accountId}/transactions?page-size=3`;

      const all: any[] = [];
      let url: string | undefined = `${base}&page=1`;
      while (url) {
        const body: any = (await app.inject({ url, headers: consentHeaders(consentId) })).json();
        all.push(...body.data);
        url = body.links.next;
      }
      const ids = all.map((t) => t.transactionId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(all.map((t) => t.transactionDateTime)).toEqual([...all.map((t) => t.transactionDateTime)].sort());
    });

    it('filtra pelo intervalo de datas', async () => {
      const { consentId, accountId } = await authorisedConsent();
      const res = await app.inject({
        url: `/open-banking/credit-cards-accounts/v2/accounts/${accountId}/transactions?fromTransactionDate=2000-01-01&toTransactionDate=2000-01-31`,
        headers: consentHeaders(consentId),
      });
      expect(res.json().data).toEqual([]);
      expect(res.json().meta.totalRecords).toBe(0);
    });

    it('não deixa um consentimento ler a conta de outro', async () => {
      const a = await authorisedConsent();
      const b = await authorisedConsent();
      const res = await app.inject({
        url: `/open-banking/credit-cards-accounts/v2/accounts/${b.accountId}/transactions`,
        headers: consentHeaders(a.consentId),
      });
      expect(res.statusCode).toBe(404);
    });

    it('simula compra com valor, MCC e nome escolhidos', async () => {
      const { consentId } = await authorisedConsent();
      const tx = app.simulatePurchase(consentId, { cents: 12345, mcc: 5541, name: 'POSTO' });
      expect(tx).toMatchObject({ amount: { amount: '123.45' }, payeeMCC: 5541, transactionName: 'POSTO', creditDebitType: 'DEBITO' });
    });

    it('não simula compra para consentimento não autorizado', async () => {
      const { data } = await createConsent();
      expect(() => app.simulatePurchase(data.consentId)).toThrow(/não está autorizado/);
    });

    it('estorno gera um crédito ESTORNO apontando para a compra original', async () => {
      const { consentId } = await authorisedConsent();
      const tx = app.simulatePurchase(consentId, { cents: 500 });
      const res = await app.inject({ method: 'POST', url: '/sandbox/reversal', payload: { consentId, transactionId: tx.transactionId } });
      expect(res.json().transaction).toMatchObject({
        creditDebitType: 'CREDITO',
        transactionType: 'ESTORNO',
        sandboxReversalOf: tx.transactionId,
        amount: tx.amount,
      });
    });
  });
});

describe('webhooks do Banco Sandbox', () => {
  afterEach(async () => {
    vi.useRealTimers();
    await app?.close();
  });

  it('assina o corpo com HMAC-SHA256 no formato t=...,v1=...', () => {
    const header = signPayload('s', '{"a":1}', 1700000000);
    const expected = createHmac('sha256', 's').update('1700000000.{"a":1}').digest('hex');
    expect(header).toBe(`t=1700000000,v1=${expected}`);
  });

  it('avisa "transactions.created" com a janela de datas e os ids da compra', async () => {
    const received: { body: any; signature: string | null }[] = [];
    server.use(
      http.post(WEBHOOK, async ({ request }) => {
        received.push({ body: await request.json(), signature: request.headers.get('x-ow-signature') });
        return new HttpResponse(null, { status: 202 });
      }),
    );
    app = await buildMockApp(options({ webhookUrl: WEBHOOK }));
    const { data } = await createConsent();
    await authorise(data.consentId);
    await vi.waitFor(() => expect(received).toHaveLength(1)); // histórico inicial

    const tx = app.simulatePurchase(data.consentId);
    await vi.waitFor(() => expect(received).toHaveLength(2));

    const event = received[1]!;
    expect(event.body).toMatchObject({
      event: 'transactions.created',
      consentId: data.consentId,
      transactionIds: [tx.transactionId],
      fromDate: tx.transactionDateTime.slice(0, 10),
      toDate: tx.transactionDateTime.slice(0, 10),
    });
    expect(event.body.eventId).toEqual(expect.any(String));
    expect(event.signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });

  it('tenta de novo com espera exponencial quando o app está fora do ar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    let calls = 0;
    server.use(
      http.post(WEBHOOK, () => {
        calls++;
        return new HttpResponse(null, { status: calls < 3 ? 503 : 200 });
      }),
    );
    app = await buildMockApp(options({ webhookUrl: WEBHOOK, backfillDays: 1 }));
    const { data } = await createConsent();
    await authorise(data.consentId);

    await vi.advanceTimersByTimeAsync(500); // envio inicial (0,5 s após autorizar)
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000); // 1ª espera: 1 s
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(2_000); // 2ª espera: 2 s
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(3); // entregou: para de tentar
  });

  it('não insiste quando o app recusa o evento (4xx)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    let calls = 0;
    server.use(
      http.post(WEBHOOK, () => {
        calls++;
        return new HttpResponse(null, { status: 401 });
      }),
    );
    app = await buildMockApp(options({ webhookUrl: WEBHOOK }));
    const { data } = await createConsent();
    await authorise(data.consentId);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toBe(1);
  });
});
