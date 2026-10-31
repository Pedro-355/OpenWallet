import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { TaxRatesTable } from '@openwallet/tax';
import type { Config } from './config.js';
import type { Pool } from './db/pool.js';
import { Cache } from './lib/cache.js';
import { HttpError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { expenseRoutes } from './routes/expenses.js';
import { impostometroRoutes } from './routes/impostometro.js';
import { healthRoutes } from './routes/health.js';
import { taxRoutes } from './routes/tax.js';

export interface AppDeps {
  config: Config;
  pool: Pool;
  redis: Redis | null;
  rates: TaxRatesTable;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
    cache: Cache;
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 16 * 1024,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    // Fecha conexões ociosas rápido no desligamento (deploy sem derrubar requisições).
    forceCloseConnections: 'idle',
    connectionTimeout: 30_000,
    keepAliveTimeout: 72_000, // maior que o timeout típico de load balancers (60s)
  });

  app.decorate('deps', deps);
  app.decorate('cache', new Cache(deps.redis, app.log));

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: false,
    exposedHeaders: ['x-request-id', 'etag'],
  });

  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    // Com Redis o limite vale para todas as réplicas; sem Redis, por réplica.
    ...(deps.redis ? { redis: deps.redis } : {}),
    // Se o Redis falhar, não bloqueia todo mundo.
    skipOnError: true,
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        try {
          const decoded = app.jwt.decode<{ sub?: string }>(auth.slice(7));
          if (decoded?.sub) return `u:${decoded.sub}`;
        } catch {
          /* cai para IP */
        }
      }
      return `ip:${req.ip}`;
    },
    allowList: (req) => req.url.startsWith('/health'),
  });

  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.ACCESS_TOKEN_TTL },
  });

  app.decorate('authenticate', async (req) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new HttpError(401, 'unauthorized', 'Token inválido ou expirado');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Dados inválidos',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: e.code ?? 'bad_request', message: e.message });
    }
    req.log.error({ err }, 'erro inesperado');
    return reply.status(503 === e.statusCode ? 503 : 500).send({
      error: 'internal_error',
      message: 'Erro interno. Tente novamente.',
      requestId: req.id,
    });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: 'not_found', message: `Rota ${req.method} ${req.url} não existe` }),
  );

  await app.register(healthRoutes);
  await app.register(taxRoutes, { prefix: '/v1' });
  await app.register(authRoutes, { prefix: '/v1' });
  await app.register(expenseRoutes, { prefix: '/v1' });
  await app.register(impostometroRoutes, { prefix: '/v1' });

  return app;
}
