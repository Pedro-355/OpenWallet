import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claim, enqueue, reapStale } from '../src/lib/queue.js';
import { createWorker } from '../src/lib/worker.js';
import { setup } from './helpers.js';

const silent = { info() {}, warn() {}, error() {} };
let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup({ redis: false });
});
afterAll(async () => {
  await ctx.close();
});

describe('fila de trabalhos', () => {
  it('vários workers ao mesmo tempo nunca pegam o mesmo trabalho', async () => {
    for (let i = 0; i < 200; i++) await enqueue(ctx.pool, 'teste', { i });
    const batches = await Promise.all(Array.from({ length: 8 }, () => claim(ctx.pool, 40)));
    const ids = batches.flat().map((j) => j.id);
    expect(ids.length).toBe(200);
    expect(new Set(ids).size).toBe(200);
    await ctx.pool.query(`UPDATE jobs SET status = 'done'`);
  });

  it('erro → tenta de novo depois; esgotou as tentativas → dead', async () => {
    let calls = 0;
    const worker = createWorker({
      pool: ctx.pool, log: silent,
      handlers: { quebra: async () => { calls++; throw new Error('boom'); } },
    });
    await enqueue(ctx.pool, 'quebra', {}, { maxAttempts: 2 });
    await worker.drain();
    let job = (await ctx.pool.query(`SELECT * FROM jobs WHERE queue = 'quebra'`)).rows[0];
    expect(job).toMatchObject({ status: 'pending', attempts: 1, last_error: 'boom' });
    expect(new Date(job.run_at).getTime()).toBeGreaterThan(Date.now());

    await ctx.pool.query(`UPDATE jobs SET run_at = now() WHERE queue = 'quebra'`);
    await worker.drain();
    job = (await ctx.pool.query(`SELECT * FROM jobs WHERE queue = 'quebra'`)).rows[0];
    expect(job.status).toBe('dead');
    expect(calls).toBe(2);
  });

  it('trabalho preso (worker morreu) volta para a fila', async () => {
    const id = await enqueue(ctx.pool, 'teste', {});
    await claim(ctx.pool, 10);
    await ctx.pool.query(`UPDATE jobs SET locked_at = now() - interval '10 minutes' WHERE id = $1`, [id]);
    expect(await reapStale(ctx.pool)).toBe(1);
    const { rows } = await ctx.pool.query(`SELECT status FROM jobs WHERE id = $1`, [id]);
    expect(rows[0].status).toBe('pending');
  });

  it('worker acorda na hora com NOTIFY, sem esperar o polling', async () => {
    let done!: () => void;
    const finished = new Promise<void>((r) => (done = r));
    const worker = createWorker({
      pool: ctx.pool, log: silent, pollMs: 60_000,
      handlers: { rapido: async () => done() },
    });
    await ctx.pool.query(`UPDATE jobs SET status = 'done' WHERE status = 'pending'`);
    await worker.start();
    const t0 = Date.now();
    await enqueue(ctx.pool, 'rapido', {});
    await finished;
    expect(Date.now() - t0).toBeLessThan(2000);
    await worker.stop();
  });
});
