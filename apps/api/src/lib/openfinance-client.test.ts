import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ProviderError, SandboxOpenFinanceClient } from './openfinance-client.js';

// MSW intercepta o fetch: testamos o cliente HTTP sem subir servidor nenhum.
const BASE = 'https://banco.test';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = new SandboxOpenFinanceClient(BASE, 'chave-123', 500);
const tx = (id: string) => ({
  transactionId: id,
  transactionName: 'LOJA',
  creditDebitType: 'DEBITO',
  transactionType: 'OUTROS',
  amount: { amount: '10.00', currency: 'BRL' },
  transactionDateTime: '2026-10-01T12:00:00.000Z',
  payeeMCC: 5411,
});

describe('SandboxOpenFinanceClient', () => {
  it('cria consentimento enviando chave, redirect, state e as permissões de cartão', async () => {
    let body: any;
    let apiKey: string | null = null;
    server.use(
      http.post(`${BASE}/open-banking/consents/v3/consents`, async ({ request }) => {
        body = await request.json();
        apiKey = request.headers.get('x-api-key');
        return HttpResponse.json(
          { data: { consentId: 'urn:c1', status: 'AWAITING_AUTHORISATION' }, links: { authorize: `${BASE}/authorize?c=1` } },
          { status: 201 },
        );
      }),
    );

    const result = await client.createConsent({ redirectUri: 'https://app/cb', state: 'xyz' });

    expect(result).toEqual({ consentId: 'urn:c1', authorizeUrl: `${BASE}/authorize?c=1` });
    expect(apiKey).toBe('chave-123');
    expect(body).toMatchObject({ redirectUri: 'https://app/cb', state: 'xyz' });
    expect(body.data.permissions).toEqual(expect.arrayContaining(['CREDIT_CARDS_ACCOUNTS_TRANSACTIONS_READ', 'RESOURCES_READ']));
  });

  it('codifica o id do consentimento na URL', async () => {
    let path = '';
    server.use(
      http.get(`${BASE}/open-banking/consents/v3/consents/:id`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ data: { status: 'AUTHORISED' } });
      }),
    );
    await expect(client.getConsentStatus('urn:sandbox:a/b')).resolves.toBe('AUTHORISED');
    expect(path).toBe('/open-banking/consents/v3/consents/urn%3Asandbox%3Aa%2Fb');
  });

  it('segue os links de paginação até o fim, enviando o consentimento em cada página', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/open-banking/credit-cards-accounts/v2/accounts/acc1/transactions`, ({ request }) => {
        const url = new URL(request.url);
        seen.push(request.headers.get('x-consent-id'));
        const page = Number(url.searchParams.get('page'));
        const next = page < 3 ? `/open-banking/credit-cards-accounts/v2/accounts/acc1/transactions?page=${page + 1}` : undefined;
        return HttpResponse.json({ data: [tx(`t${page}`)], links: { next } });
      }),
    );

    const pages: string[][] = [];
    for await (const page of client.listCardTransactions('c1', 'acc1', '2026-10-01', '2026-10-31')) {
      pages.push(page.map((t) => t.transactionId));
    }

    expect(pages).toEqual([['t1'], ['t2'], ['t3']]);
    expect(seen).toEqual(['c1', 'c1', 'c1']);
  });

  it('pede o intervalo de datas e o tamanho de página na primeira chamada', async () => {
    let query: URLSearchParams | undefined;
    server.use(
      http.get(`${BASE}/open-banking/credit-cards-accounts/v2/accounts/acc1/transactions`, ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({ data: [], links: {} });
      }),
    );
    for await (const _ of client.listCardTransactions('c1', 'acc1', '2026-10-01', '2026-10-31')) { /* consome */ }
    expect(Object.fromEntries(query!)).toMatchObject({
      fromTransactionDate: '2026-10-01',
      toTransactionDate: '2026-10-31',
      'page-size': '500',
      page: '1',
    });
  });

  it('lista os ids das contas de cartão', async () => {
    server.use(
      http.get(`${BASE}/open-banking/credit-cards-accounts/v2/accounts`, () =>
        HttpResponse.json({ data: [{ creditCardAccountId: 'a1' }, { creditCardAccountId: 'a2' }] }),
      ),
    );
    await expect(client.listCardAccountIds('c1')).resolves.toEqual(['a1', 'a2']);
  });

  it('revogar aceita 204 sem corpo', async () => {
    server.use(http.delete(`${BASE}/open-banking/consents/v3/consents/:id`, () => new HttpResponse(null, { status: 204 })));
    await expect(client.revokeConsent('c1')).resolves.toBeUndefined();
  });

  it.each([401, 403, 404, 429, 500])('resposta %i vira ProviderError com o status', async (status) => {
    server.use(http.get(`${BASE}/open-banking/consents/v3/consents/:id`, () => new HttpResponse(null, { status })));
    const err = await client.getConsentStatus('c1').catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(status);
  });

  it('desiste quando o banco demora demais (timeout)', async () => {
    server.use(
      http.get(`${BASE}/open-banking/consents/v3/consents/:id`, async () => {
        await new Promise((r) => setTimeout(r, 2_000));
        return HttpResponse.json({});
      }),
    );
    await expect(client.getConsentStatus('c1')).rejects.toThrow(/timeout|aborted/i);
  });
});
