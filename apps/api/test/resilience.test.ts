import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser, setup } from './helpers.js';

// A API precisa continuar funcionando sem Redis (cache e rate limit degradam com segurança).
let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup({ redis: false });
});
afterAll(async () => {
  await ctx.close();
});

describe('sem Redis', () => {
  it('readiness continua ok e o resumo funciona sem cache', async () => {
    const ready = await ctx.app.inject('/health/ready');
    expect(ready.statusCode).toBe(200);
    expect(ready.json().checks.redis).toBe('disabled');

    const u = await registerUser(ctx.app);
    await ctx.app.inject({
      method: 'POST', url: '/v1/expenses', headers: u.auth,
      payload: { amountCents: 1000, category: 'mercado', spentOn: '2026-10-01' },
    });
    const s = await ctx.app.inject({ url: '/v1/impostometro/summary?month=2026-10', headers: u.auth });
    expect(s.statusCode).toBe(200);
    expect(s.json().totals.count).toBe(1);
  });
});
