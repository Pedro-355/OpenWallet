import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser, setup } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => {
  await ctx.close();
});

describe('saúde', () => {
  it('live e ready respondem', async () => {
    expect((await ctx.app.inject('/health/live')).statusCode).toBe(200);
    const ready = await ctx.app.inject('/health/ready');
    expect(ready.statusCode).toBe(200);
    expect(ready.json().checks).toMatchObject({ database: 'ok', redis: 'ok' });
  });
});

describe('autenticação', () => {
  it('cadastra, faz login e bloqueia e-mail repetido (sem diferenciar maiúsculas)', async () => {
    const u = await registerUser(ctx.app);
    const dup = await ctx.app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { email: u.email.toUpperCase(), password: 'outra-senha-1', uf: 'RJ' },
    });
    expect(dup.statusCode).toBe(409);

    const ok = await ctx.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: u.email, password: 'senha-forte-123' } });
    expect(ok.statusCode).toBe(200);
    const bad = await ctx.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: u.email, password: 'errada' } });
    expect(bad.statusCode).toBe(401);
    const ghost = await ctx.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'ninguem@x.com', password: 'qualquer1' } });
    expect(ghost.statusCode).toBe(401);
  });

  it('rotaciona refresh token e derruba as sessões se um token antigo for reutilizado', async () => {
    const u = await registerUser(ctx.app);
    const r1 = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: u.refreshToken } });
    expect(r1.statusCode).toBe(200);
    const fresh = r1.json().refreshToken as string;

    const reuse = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: u.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    // O token novo também foi revogado por segurança.
    const after = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: fresh } });
    expect(after.statusCode).toBe(401);
  });

  it('exige token nas rotas privadas', async () => {
    expect((await ctx.app.inject('/v1/expenses')).statusCode).toBe(401);
    expect((await ctx.app.inject({ url: '/v1/me', headers: { authorization: 'Bearer lixo' } })).statusCode).toBe(401);
  });
});

describe('gastos e impostômetro', () => {
  it('grava o gasto com o imposto calculado pela UF do perfil', async () => {
    const u = await registerUser(ctx.app, 'SP');
    const res = await ctx.app.inject({
      method: 'POST', url: '/v1/expenses', headers: u.auth,
      payload: { amountCents: 10_000, category: 'mercado', description: 'Feira', spentOn: '2026-10-05' },
    });
    expect(res.statusCode).toBe(201);
    const e = res.json().expense;
    expect(e.uf).toBe('SP');
    expect(e.tax.totalCents).toBe(e.tax.federalCents + e.tax.estadualCents + e.tax.municipalCents);
    expect(e.tax.totalCents).toBeGreaterThan(0);
    expect(e.tax.ratesVersion).toBeTruthy();
  });

  it('Idempotency-Key evita gasto duplicado quando o app reenvia', async () => {
    const u = await registerUser(ctx.app);
    const send = () => ctx.app.inject({
      method: 'POST', url: '/v1/expenses',
      headers: { ...u.auth, 'idempotency-key': 'chave-unica-123' },
      payload: { amountCents: 500, category: 'bebidas', spentOn: '2026-10-01' },
    });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().expense.id).toBe(b.json().expense.id);
    const list = await ctx.app.inject({ url: '/v1/expenses', headers: u.auth });
    expect(list.json().items).toHaveLength(1);
  });

  it('valida a entrada', async () => {
    const u = await registerUser(ctx.app);
    const res = await ctx.app.inject({
      method: 'POST', url: '/v1/expenses', headers: u.auth,
      payload: { amountCents: -5, category: '', spentOn: '31/10/2026' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });

  it('pagina por cursor sem repetir nem pular itens', async () => {
    const u = await registerUser(ctx.app);
    for (let i = 1; i <= 7; i++) {
      await ctx.app.inject({
        method: 'POST', url: '/v1/expenses', headers: u.auth,
        payload: { amountCents: i * 100, category: 'outros', spentOn: `2026-09-${String(i).padStart(2, '0')}` },
      });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const qs: string = cursor ? `&cursor=${cursor}` : '';
      const page: { items: { id: string; spentOn: string }[]; nextCursor: string | null } =
        (await ctx.app.inject({ url: `/v1/expenses?limit=3${qs}`, headers: u.auth })).json();
      seen.push(...page.items.map((x) => x.spentOn));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['2026-09-07', '2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01']);
  });

  it('um usuário não enxerga nem apaga gasto de outro', async () => {
    const a = await registerUser(ctx.app);
    const b = await registerUser(ctx.app);
    const created = await ctx.app.inject({
      method: 'POST', url: '/v1/expenses', headers: a.auth,
      payload: { amountCents: 1000, category: 'outros', spentOn: '2026-10-01' },
    });
    const id = created.json().expense.id;
    expect((await ctx.app.inject({ url: `/v1/expenses/${id}`, headers: b.auth })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/v1/expenses/${id}`, headers: b.auth })).statusCode).toBe(404);
    expect((await ctx.app.inject({ url: `/v1/expenses/${id}`, headers: a.auth })).statusCode).toBe(200);
  });

  it('editar o valor recalcula o imposto', async () => {
    const u = await registerUser(ctx.app);
    const created = (await ctx.app.inject({
      method: 'POST', url: '/v1/expenses', headers: u.auth,
      payload: { amountCents: 1000, category: 'combustivel', spentOn: '2026-10-01' },
    })).json().expense;
    const updated = (await ctx.app.inject({
      method: 'PATCH', url: `/v1/expenses/${created.id}`, headers: u.auth, payload: { amountCents: 2000 },
    })).json().expense;
    expect(updated.amountCents).toBe(2000);
    expect(updated.tax.totalCents).toBe(created.tax.totalCents * 2);
  });

  it('resumo do mês soma por categoria, usa cache e invalida ao gravar', async () => {
    const u = await registerUser(ctx.app);
    const add = (amountCents: number, category: string, spentOn: string) =>
      ctx.app.inject({ method: 'POST', url: '/v1/expenses', headers: u.auth, payload: { amountCents, category, spentOn } });
    await add(10_000, 'mercado', '2026-10-02');
    await add(20_000, 'combustivel', '2026-10-15');
    await add(5_000, 'mercado', '2026-09-30'); // outro mês

    const s1 = await ctx.app.inject({ url: '/v1/impostometro/summary?month=2026-10', headers: u.auth });
    expect(s1.headers['x-cache']).toBe('miss');
    const body = s1.json();
    expect(body.totals.spentCents).toBe(30_000);
    expect(body.totals.count).toBe(2);
    expect(body.totals.taxCents).toBe(body.totals.federalCents + body.totals.estadualCents + body.totals.municipalCents);
    expect(body.byCategory.map((c: { category: string }) => c.category).sort()).toEqual(['combustivel', 'mercado']);
    expect(body.yearToDate.spentCents).toBe(35_000);

    const s2 = await ctx.app.inject({ url: '/v1/impostometro/summary?month=2026-10', headers: u.auth });
    expect(s2.headers['x-cache']).toBe('hit');

    await add(1_000, 'bebidas', '2026-10-20');
    const s3 = await ctx.app.inject({ url: '/v1/impostometro/summary?month=2026-10', headers: u.auth });
    expect(s3.headers['x-cache']).toBe('miss');
    expect(s3.json().totals.count).toBe(3);
  });

  it('histórico devolve um ponto por mês, inclusive meses vazios', async () => {
    const u = await registerUser(ctx.app);
    const res = await ctx.app.inject({ url: '/v1/impostometro/history?months=6', headers: u.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().months).toHaveLength(6);
  });
});

describe('tabela de alíquotas', () => {
  it('serve com ETag e responde 304 quando não mudou', async () => {
    const r1 = await ctx.app.inject('/v1/tax/rates');
    expect(r1.statusCode).toBe(200);
    const etag = r1.headers.etag as string;
    const r2 = await ctx.app.inject({ url: '/v1/tax/rates', headers: { 'if-none-match': etag } });
    expect(r2.statusCode).toBe(304);
  });

  it('simula imposto sem salvar', async () => {
    const r = await ctx.app.inject('/v1/tax/estimate?amountCents=10000&category=mercado&uf=BA');
    expect(r.statusCode).toBe(200);
    expect(r.json().tax.uf).toBe('BA');
  });
});
