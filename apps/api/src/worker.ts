/**
 * Processo worker: consome a fila (webhooks do Open Finance, sincronizações).
 * Rode quantas réplicas quiser — a fila garante que cada trabalho vai para um só worker.
 */
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { loadRatesFile } from '@openwallet/tax/node';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { Cache } from './lib/cache.js';
import { createProvider } from './lib/provider-factory.js';
import { createWorker } from './lib/worker.js';
import { createOpenFinanceService } from './services/openfinance.js';

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL, base: { service: 'worker' } });
const pool = createPool(config);
const redis = config.REDIS_URL
  ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
  : null;
redis?.on('error', () => {});

const provider = createProvider(config);
if (!provider) {
  log.error('OPENFINANCE_BASE_URL não definida: nada para o worker fazer');
  process.exit(1);
}
const service = createOpenFinanceService({
  pool,
  provider,
  providerName: config.OPENFINANCE_PROVIDER,
  rates: loadRatesFile(config.TAX_RATES_FILE),
  cache: new Cache(redis, log),
  log,
  backfillDays: config.OPENFINANCE_BACKFILL_DAYS,
});

const worker = createWorker({ pool, log, handlers: service.handlers, concurrency: config.WORKER_CONCURRENCY });
await worker.start();
log.info({ concurrency: config.WORKER_CONCURRENCY }, 'worker iniciado');

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  log.info({ signal }, 'parando worker (terminando jobs em andamento)');
  setTimeout(() => process.exit(1), 60_000).unref();
  await worker.stop();
  await pool.end();
  await redis?.quit().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
