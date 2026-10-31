import type { TaxRatesTable } from '@openwallet/tax';

const BASE = import.meta.env.VITE_API_URL ?? '/api';
const STORAGE_KEY = 'openwallet.session';

export interface User { id: string; email: string; uf: string }
export interface Expense {
  id: string;
  amountCents: number;
  category: string;
  description: string;
  uf: string;
  spentOn: string;
  source: 'manual' | 'openfinance';
  tax: { federalCents: number; estadualCents: number; municipalCents: number; totalCents: number; ratePct: number; ratesVersion: string };
}
export interface Summary {
  month: string;
  illustrative: boolean;
  ratesVersion: string;
  totals: { count: number; spentCents: number; taxCents: number; federalCents: number; estadualCents: number; municipalCents: number; effectivePct: number };
  yearToDate: { taxCents: number; spentCents: number };
  byCategory: { category: string; label: string; count: number; spentCents: number; taxCents: number; effectivePct: number }[];
}
export interface Connection {
  id: string;
  institution: string;
  status: 'pending' | 'active' | 'rejected' | 'revoked' | 'error';
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
}
export interface History { months: { month: string; spentCents: number; taxCents: number }[] }

interface Session { accessToken: string; refreshToken: string; user: User }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
let session = readSession();
const listeners = new Set<() => void>();

function saveSession(s: Session | null) {
  session = s;
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* modo privado etc. — segue só em memória */
  }
  listeners.forEach((l) => l());
}

export const auth = {
  get user() {
    return session?.user ?? null;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async login(email: string, password: string) {
    saveSession(await raw<Session>('POST', '/v1/auth/login', { email, password }));
  },
  async register(email: string, password: string, uf: string) {
    saveSession(await raw<Session>('POST', '/v1/auth/register', { email, password, uf }));
  },
  async logout() {
    const s = session;
    saveSession(null);
    if (s) await raw('POST', '/v1/auth/logout', { refreshToken: s.refreshToken }).catch(() => {});
  },
  setUser(user: User) {
    if (session) saveSession({ ...session, user });
  },
};

async function raw<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Algo deu errado');
  return data as T;
}

// Um único refresh por vez, mesmo se várias requisições receberem 401 juntas.
let refreshing: Promise<boolean> | null = null;
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const s = session;
    if (!s) return false;
    try {
      const t = await raw<{ accessToken: string; refreshToken: string }>('POST', '/v1/auth/refresh', { refreshToken: s.refreshToken });
      saveSession({ ...s, ...t });
      return true;
    } catch {
      saveSession(null);
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function call<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
  const attempt = () => raw<T>(method, path, body, { ...extra, authorization: `Bearer ${session?.accessToken ?? ''}` });
  try {
    return await attempt();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && (await refresh())) return attempt();
    throw err;
  }
}

export const api = {
  rates: () => raw<TaxRatesTable>('GET', '/v1/tax/rates'),
  me: () => call<{ user: User }>('GET', '/v1/me'),
  updateUf: (uf: string) => call<{ user: User }>('PATCH', '/v1/me', { uf }),
  summary: (month: string) => call<Summary>('GET', `/v1/impostometro/summary?month=${month}`),
  history: (months = 6) => call<History>('GET', `/v1/impostometro/history?months=${months}`),
  expenses: (from: string, to: string, cursor?: string) =>
    call<{ items: Expense[]; nextCursor: string | null }>(
      'GET',
      `/v1/expenses?limit=50&from=${from}&to=${to}${cursor ? `&cursor=${cursor}` : ''}`,
    ),
  /** `idempotencyKey` deve ser o mesmo em reenvios do MESMO formulário: assim um clique duplo não duplica o gasto. */
  createExpense: (
    e: { amountCents: number; category: string; description: string; uf: string; spentOn: string },
    idempotencyKey: string,
  ) => call<{ expense: Expense }>('POST', '/v1/expenses', e, { 'idempotency-key': idempotencyKey }),
  deleteExpense: (id: string) => call<void>('DELETE', `/v1/expenses/${id}`),

  connections: () => call<{ enabled: boolean; connections: Connection[] }>('GET', '/v1/openfinance/connections'),
  connectBank: () => call<{ connection: Connection; authorizeUrl: string }>('POST', '/v1/openfinance/connections'),
  finishConnection: (consentId: string, state: string) =>
    call<{ connection: Connection }>('POST', '/v1/openfinance/connections/callback', { consentId, state }),
  syncConnection: (id: string) => call<{ queued: boolean }>('POST', `/v1/openfinance/connections/${id}/sync`),
  disconnect: (id: string) => call<void>('DELETE', `/v1/openfinance/connections/${id}`),
};
