/**
 * Cliente do provedor de dados Open Finance.
 *
 * Fala com o Banco Sandbox (apps/openfinance-mock), que segue o formato do Open Finance Brasil.
 * Para usar um agregador real (Pluggy, Belvo, etc.), implemente esta mesma interface com a API dele.
 */
export interface CardTransaction {
  transactionId: string;
  transactionName: string;
  creditDebitType: 'DEBITO' | 'CREDITO';
  transactionType: string;
  amount: { amount: string; currency: string };
  transactionDateTime: string;
  payeeMCC: number | null;
  /** Extensão do sandbox: estorno de qual transação. */
  sandboxReversalOf?: string;
}

export interface OpenFinanceProvider {
  createConsent(input: { redirectUri: string; state: string }): Promise<{ consentId: string; authorizeUrl: string }>;
  getConsentStatus(consentId: string): Promise<string>;
  revokeConsent(consentId: string): Promise<void>;
  listCardAccountIds(consentId: string): Promise<string[]>;
  listCardTransactions(consentId: string, accountId: string, from: string, to: string): AsyncGenerator<CardTransaction[]>;
}

export class ProviderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class SandboxOpenFinanceClient implements OpenFinanceProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 10_000,
  ) {}

  private async request<T>(method: string, path: string, opts: { consentId?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: {
        'x-api-key': this.apiKey,
        ...(opts.consentId ? { 'x-consent-id': opts.consentId } : {}),
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new ProviderError(res.status, `provedor respondeu ${res.status} em ${method} ${path}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async createConsent({ redirectUri, state }: { redirectUri: string; state: string }) {
    const r = await this.request<{ data: { consentId: string }; links: { authorize: string } }>(
      'POST', '/open-banking/consents/v3/consents',
      {
        body: {
          redirectUri,
          state,
          data: { permissions: ['CREDIT_CARDS_ACCOUNTS_READ', 'CREDIT_CARDS_ACCOUNTS_TRANSACTIONS_READ', 'RESOURCES_READ'] },
        },
      },
    );
    return { consentId: r.data.consentId, authorizeUrl: r.links.authorize };
  }

  async getConsentStatus(consentId: string) {
    const r = await this.request<{ data: { status: string } }>('GET', `/open-banking/consents/v3/consents/${encodeURIComponent(consentId)}`);
    return r.data.status;
  }

  async revokeConsent(consentId: string) {
    await this.request('DELETE', `/open-banking/consents/v3/consents/${encodeURIComponent(consentId)}`);
  }

  async listCardAccountIds(consentId: string) {
    const r = await this.request<{ data: { creditCardAccountId: string }[] }>(
      'GET', '/open-banking/credit-cards-accounts/v2/accounts', { consentId },
    );
    return r.data.map((a) => a.creditCardAccountId);
  }

  async *listCardTransactions(consentId: string, accountId: string, from: string, to: string) {
    let path: string | undefined =
      `/open-banking/credit-cards-accounts/v2/accounts/${encodeURIComponent(accountId)}/transactions` +
      `?fromTransactionDate=${from}&toTransactionDate=${to}&page-size=500&page=1`;
    // Segue os links de paginação, como manda a especificação.
    for (let guard = 0; path && guard < 1000; guard++) {
      const r: { data: CardTransaction[]; links?: { next?: string } } = await this.request('GET', path, { consentId });
      yield r.data;
      path = r.links?.next;
    }
  }
}
