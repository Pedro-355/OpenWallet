import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { loadRatesFile } from '@openwallet/tax/node';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import type { OpenFinanceProvider } from '../src/lib/openfinance-client.js';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/openwallet_test';
export const TEST_REDIS = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380';

export async function setup(opts: { redis?: boolean; env?: Record<string, string>; provider?: OpenFinanceProvider } = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    JWT_SECRET: 'x'.repeat(40),
    RATE_LIMIT_MAX: '10000',
    AUTH_RATE_LIMIT_MAX: '10000',
    ...(opts.redis !== false ? { REDIS_URL: TEST_REDIS } : {}),
    ...opts.env,
  });
  const pool = createPool(config);
  await migrate(pool, () => {});
  await pool.query('TRUNCATE users, sessions, expenses, bank_connections, webhook_events, jobs, expense_tombstones CASCADE');
  const redis = config.REDIS_URL ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 }) : null;
  if (redis) {
    await redis.flushdb();
  }
  const app = await buildApp({ config, pool, redis, rates: loadRatesFile(), provider: opts.provider ?? null });
  await app.ready();
  return {
    app,
    config,
    pool,
    redis,
    async close() {
      await app.close();
      await pool.end();
      await redis?.quit();
    },
  };
}

let counter = 0;
export async function registerUser(app: FastifyInstance, uf = 'SP') {
  const email = `user${Date.now()}${counter++}@teste.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'senha-forte-123', uf },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  const body = res.json() as { accessToken: string; refreshToken: string; user: { id: string } };
  return { ...body, email, auth: { authorization: `Bearer ${body.accessToken}` } };
}
