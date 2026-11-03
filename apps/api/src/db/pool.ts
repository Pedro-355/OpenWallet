import pg from 'pg';
import type { Config } from '../config.js';

// bigint (int8) chega como string por padrão; nossos valores em centavos cabem em Number com folga.
pg.types.setTypeParser(20, (v) => Number(v));
// numeric -> number (usado em tax_rate_pct)
pg.types.setTypeParser(1700, (v) => Number(v));
// date -> 'YYYY-MM-DD' sem conversão de fuso
pg.types.setTypeParser(1082, (v) => v);

export function createPool(config: Pick<Config, 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_STATEMENT_TIMEOUT_MS'>) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Uma consulta lenta não pode segurar a conexão para sempre.
    statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: 10_000,
    application_name: 'openwallet-api',
  });
  return pool;
}

export type Pool = pg.Pool;
