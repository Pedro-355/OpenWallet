import type pg from 'pg';
import type { Pool } from '../db/pool.js';

export interface Job<T = unknown> {
  id: number;
  queue: string;
  payload: T;
  attempts: number;
  max_attempts: number;
}

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export const NOTIFY_CHANNEL = 'jobs_ready';

/** Enfileira um trabalho. Use o mesmo `db` da transação para gravar e enfileirar juntos. */
export async function enqueue(db: Queryable, queue: string, payload: unknown, opts: { delaySeconds?: number; maxAttempts?: number } = {}) {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO jobs (queue, payload, run_at, max_attempts)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4) RETURNING id`,
    [queue, JSON.stringify(payload), opts.delaySeconds ?? 0, opts.maxAttempts ?? 8],
  );
  // Acorda os workers na hora (o NOTIFY só é entregue no COMMIT).
  await db.query(`SELECT pg_notify($1, '')`, [NOTIFY_CHANNEL]);
  return rows[0]!.id;
}

/** Pega até `limit` trabalhos prontos. SKIP LOCKED: dois workers nunca pegam o mesmo. */
export async function claim(pool: Pool, limit: number): Promise<Job[]> {
  const { rows } = await pool.query<Job>(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_at = now(), updated_at = now()
      WHERE id IN (
        SELECT id FROM jobs WHERE status = 'pending' AND run_at <= now()
        ORDER BY run_at LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING id, queue, payload, attempts, max_attempts`,
    [limit],
  );
  return rows;
}

export async function complete(pool: Pool, id: number) {
  await pool.query(`UPDATE jobs SET status = 'done', locked_at = NULL, updated_at = now() WHERE id = $1`, [id]);
}

/** Falhou: tenta de novo com espera exponencial (10s, 20s, 40s... até 1h). Esgotou: vai para 'dead'. */
export async function fail(pool: Pool, job: Job, err: unknown) {
  const dead = job.attempts >= job.max_attempts;
  const delay = Math.min(3600, 10 * 2 ** (job.attempts - 1));
  await pool.query(
    `UPDATE jobs SET status = $2, locked_at = NULL, updated_at = now(),
       run_at = now() + make_interval(secs => $3), last_error = left($4, 2000)
     WHERE id = $1`,
    [job.id, dead ? 'dead' : 'pending', delay, err instanceof Error ? err.message : String(err)],
  );
  return dead;
}

/** Devolve para a fila trabalhos presos em 'running' (worker morreu no meio). */
export async function reapStale(pool: Pool, olderThanSeconds = 300) {
  const { rowCount } = await pool.query(
    `UPDATE jobs SET status = 'pending', locked_at = NULL, updated_at = now()
      WHERE status = 'running' AND locked_at < now() - make_interval(secs => $1)`,
    [olderThanSeconds],
  );
  return rowCount ?? 0;
}

/** Limpeza: trabalhos concluídos e eventos de webhook antigos. */
export async function cleanup(pool: Pool) {
  await pool.query(`DELETE FROM jobs WHERE status = 'done' AND updated_at < now() - interval '1 day'`);
  await pool.query(`DELETE FROM webhook_events WHERE received_at < now() - interval '30 days'`);
}
