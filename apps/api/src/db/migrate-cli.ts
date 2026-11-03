import { createPool } from './pool.js';
import { migrate } from './migrate.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}
const pool = createPool({ DATABASE_URL: url, DB_POOL_MAX: 1, DB_STATEMENT_TIMEOUT_MS: 60_000 });
try {
  await migrate(pool);
  console.log('Migrações em dia.');
} finally {
  await pool.end();
}
