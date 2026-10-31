import { Redis } from 'ioredis';
import { loadRatesFile } from '@openwallet/tax/node';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { buildApp } from './app.js';
import { createProvider } from './lib/provider-factory.js';

const config = loadConfig();
const rates = loadRatesFile(config.TAX_RATES_FILE);
const pool = createPool(config);

const redis = config.REDIS_URL
  ? new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1, // não segura a requisição esperando o Redis voltar
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      lazyConnect: false,
    })
  : null;
redis?.on('error', () => {
  /* logado pelos usos; evita "unhandled error event" */
});

if (config.RUN_MIGRATIONS_ON_START) {
  await migrate(pool);
}

const app = await buildApp({ config, pool, redis, rates, provider: createProvider(config) });
pool.on('error', (err) => app.log.error({ err }, 'erro em conexão ociosa do Postgres'));

if (rates.illustrative) {
  app.log.warn('Usando alíquotas ILUSTRATIVAS. Rode "npm run import:ibpt" com as tabelas oficiais antes de produção.');
}

await app.listen({ host: config.HOST, port: config.PORT });

// Desligamento gracioso: para de aceitar conexões, termina as requisições em andamento
// e só então fecha banco e Redis. Evita erros 502 durante deploys.
let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'desligando');
  const force = setTimeout(() => {
    app.log.error('desligamento demorou demais; forçando saída');
    process.exit(1);
  }, 25_000);
  force.unref();
  try {
    await app.close();
    await pool.end();
    await redis?.quit();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'erro no desligamento');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  app.log.fatal({ err }, 'unhandledRejection');
  void shutdown('unhandledRejection');
});
