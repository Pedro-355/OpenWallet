import type pg from 'pg';
import type { Pool } from '../db/pool.js';
import { NOTIFY_CHANNEL, claim, cleanup, complete, fail, reapStale, type Job } from './queue.js';

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export type Handler = (payload: never, job: Job) => Promise<void>;

export interface WorkerOptions {
  pool: Pool;
  handlers: Record<string, Handler>;
  log: Logger;
  concurrency?: number;
  pollMs?: number;
}

/**
 * Consome a fila `jobs`. Pode rodar quantos processos quiser em paralelo.
 * Acorda por LISTEN/NOTIFY (latência baixa) e também por polling (caso perca uma notificação).
 */
export function createWorker({ pool, handlers, log, concurrency = 4, pollMs = 2000 }: WorkerOptions) {
  let running = false;
  let inFlight = 0;
  let wake: (() => void) | null = null;
  let listener: pg.PoolClient | null = null;
  let maintenance: NodeJS.Timeout | null = null;

  async function runJob(job: Job) {
    const handler = handlers[job.queue];
    const started = Date.now();
    try {
      if (!handler) throw new Error(`sem handler para a fila "${job.queue}"`);
      await handler(job.payload as never, job);
      await complete(pool, job.id);
      log.info({ jobId: job.id, queue: job.queue, ms: Date.now() - started }, 'job concluído');
    } catch (err) {
      const dead = await fail(pool, job, err).catch(() => false);
      log[dead ? 'error' : 'warn']({ jobId: job.id, queue: job.queue, attempt: job.attempts, err }, dead ? 'job desistido' : 'job falhou, vai tentar de novo');
    }
  }

  /** Processa tudo que estiver pronto agora. Retorna quantos trabalhos rodou. */
  async function drain(): Promise<number> {
    let total = 0;
    for (;;) {
      const free = concurrency - inFlight;
      if (free <= 0) return total;
      const jobs = await claim(pool, free);
      if (!jobs.length) return total;
      total += jobs.length;
      inFlight += jobs.length;
      await Promise.all(jobs.map((j) => runJob(j).finally(() => inFlight--)));
    }
  }

  async function loop() {
    while (running) {
      try {
        await drain();
      } catch (err) {
        log.error({ err }, 'erro ao buscar jobs');
      }
      if (!running) break;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, pollMs);
        wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      wake = null;
    }
  }

  return {
    drain,
    async start() {
      running = true;
      listener = await pool.connect();
      await listener.query(`LISTEN ${NOTIFY_CHANNEL}`);
      listener.on('notification', () => wake?.());
      maintenance = setInterval(() => {
        void reapStale(pool).then((n) => n && log.warn({ n }, 'jobs presos devolvidos à fila'));
        void cleanup(pool).catch(() => {});
      }, 60_000);
      void loop();
    },
    /** Para de pegar trabalhos novos e espera os que estão rodando terminarem. */
    async stop() {
      running = false;
      wake?.();
      if (maintenance) clearInterval(maintenance);
      while (inFlight > 0) await new Promise((r) => setTimeout(r, 100));
      if (listener) {
        await listener.query(`UNLISTEN ${NOTIFY_CHANNEL}`).catch(() => {});
        listener.release();
      }
    },
  };
}
