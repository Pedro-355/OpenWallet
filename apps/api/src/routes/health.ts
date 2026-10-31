import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  const { pool, redis } = app.deps;
  let shuttingDown = false;
  app.addHook('preClose', async () => {
    shuttingDown = true;
  });

  /** Processo vivo? (liveness — não depende de nada externo, para não reiniciar à toa). */
  app.get('/health/live', async () => ({ status: 'ok' }));

  /** Pronto para receber tráfego? (readiness — o balanceador tira a réplica se falhar). */
  app.get('/health/ready', async (_req, reply) => {
    if (shuttingDown) return reply.status(503).send({ status: 'shutting_down' });
    const checks: Record<string, string> = {};
    try {
      await pool.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
    // Redis é opcional (cache/rate limit falham de forma segura): reporta, mas não derruba.
    checks.redis = !redis ? 'disabled' : redis.status === 'ready' ? 'ok' : 'degraded';
    const ok = checks.database === 'ok';
    return reply.status(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'unavailable',
      checks,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    });
  });
}
