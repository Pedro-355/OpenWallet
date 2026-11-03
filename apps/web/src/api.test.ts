import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server, useMswServer } from './test/server';
import { aUser } from './test/factories';

useMswServer();

/** api.ts guarda a sessão em memória ao ser importado: cada teste usa um módulo novo. */
async function freshApi(session?: object) {
  if (session) localStorage.setItem('openwallet.session', JSON.stringify(session));
  vi.resetModules();
  return import('./api');
}

const session = { accessToken: 'velho', refreshToken: 'r1', user: aUser() };

describe('cliente da API', () => {
  beforeEach(() => localStorage.clear());

  it('login guarda a sessão e avisa quem está ouvindo', async () => {
    server.use(
      http.post('/api/v1/auth/login', async ({ request }) => {
        expect(await request.json()).toEqual({ email: 'a@b.com', password: 'senha' });
        return HttpResponse.json({ accessToken: 'a', refreshToken: 'r', user: aUser() });
      }),
    );
    const { auth } = await freshApi();
    const listener = vi.fn();
    auth.subscribe(listener);

    await auth.login('a@b.com', 'senha');

    expect(auth.user?.email).toBe('pedro@teste.com');
    expect(listener).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('openwallet.session')!)).toMatchObject({ accessToken: 'a' });
  });

  it('erro da API vira ApiError com a mensagem do servidor', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ error: 'unauthorized', message: 'E-mail ou senha incorretos' }, { status: 401 }),
      ),
    );
    const { auth, ApiError } = await freshApi();
    const err = await auth.login('a@b.com', 'x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: 'unauthorized', message: 'E-mail ou senha incorretos' });
  });

  it('envia o token nas rotas privadas', async () => {
    let auth: string | null = null;
    server.use(
      http.get('/api/v1/me', ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json({ user: aUser() });
      }),
    );
    const { api } = await freshApi(session);
    await api.me();
    expect(auth).toBe('Bearer velho');
  });

  it('token expirado: renova UMA vez, mesmo com várias requisições juntas, e repete todas', async () => {
    let refreshCalls = 0;
    server.use(
      http.post('/api/v1/auth/refresh', async ({ request }) => {
        refreshCalls++;
        expect(await request.json()).toEqual({ refreshToken: 'r1' });
        return HttpResponse.json({ accessToken: 'novo', refreshToken: 'r2' });
      }),
      http.get('/api/v1/me', ({ request }) =>
        request.headers.get('authorization') === 'Bearer novo'
          ? HttpResponse.json({ user: aUser() })
          : HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );
    const { api } = await freshApi(session);

    const results = await Promise.all([api.me(), api.me(), api.me()]);

    expect(results).toHaveLength(3);
    expect(refreshCalls).toBe(1);
    expect(JSON.parse(localStorage.getItem('openwallet.session')!)).toMatchObject({ accessToken: 'novo', refreshToken: 'r2' });
  });

  it('se a renovação falhar, encerra a sessão', async () => {
    server.use(
      http.post('/api/v1/auth/refresh', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
      http.get('/api/v1/me', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
    );
    const { api, auth } = await freshApi(session);
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(auth.user).toBeNull();
    expect(localStorage.getItem('openwallet.session')).toBeNull();
  });

  it('não tenta renovar em erros que não são 401', async () => {
    const refresh = vi.fn();
    server.use(
      http.post('/api/v1/auth/refresh', () => {
        refresh();
        return HttpResponse.json({});
      }),
      http.get('/api/v1/me', () => HttpResponse.json({ error: 'internal_error', message: 'boom' }, { status: 500 })),
    );
    const { api } = await freshApi(session);
    await expect(api.me()).rejects.toMatchObject({ status: 500 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('cria gasto com o Idempotency-Key informado', async () => {
    let key: string | null = null;
    server.use(
      http.post('/api/v1/expenses', ({ request }) => {
        key = request.headers.get('idempotency-key');
        return HttpResponse.json({ expense: {} }, { status: 201 });
      }),
    );
    const { api } = await freshApi(session);
    await api.createExpense({ amountCents: 1, category: 'x', description: '', uf: 'SP', spentOn: '2026-10-01' }, 'chave-1');
    expect(key).toBe('chave-1');
  });

  it('logout limpa a sessão local mesmo se o servidor estiver fora do ar', async () => {
    server.use(http.post('/api/v1/auth/logout', () => HttpResponse.error()));
    const { auth } = await freshApi(session);
    await auth.logout();
    expect(auth.user).toBeNull();
    expect(localStorage.getItem('openwallet.session')).toBeNull();
  });

  it('sessão corrompida no armazenamento é ignorada', async () => {
    localStorage.setItem('openwallet.session', '{quebrado');
    const { auth } = await freshApi();
    expect(auth.user).toBeNull();
  });
});
