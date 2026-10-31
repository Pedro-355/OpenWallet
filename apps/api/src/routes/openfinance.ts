import type { FastifyInstance } from 'fastify';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HttpError, notFound } from '../lib/errors.js';
import { enqueue } from '../lib/queue.js';
import { ProviderError } from '../lib/openfinance-client.js';
import { QUEUE_EVENT, QUEUE_SYNC, type ConnectionRow, type OpenFinanceService, type SyncJob } from '../services/openfinance.js';

const callbackBody = z.object({ consentId: z.string().min(1).max(300), state: z.string().min(1).max(100) });
const idParam = z.object({ id: z.string().uuid() });
const webhookBody = z.object({
  eventId: z.string().min(1).max(200),
  event: z.string().min(1).max(100),
  consentId: z.string().min(1).max(300),
  accountId: z.string().max(200).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const SIGNATURE_TOLERANCE_S = 300;

/** Confere "t=<unix>,v1=<hmac>" e rejeita assinaturas velhas (ataque de repetição). */
export function verifySignature(secret: string, header: string | undefined, raw: string, now = Date.now() / 1000): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(now - t) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest();
  const got = Buffer.from(parts.v1, 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const publicConnection = (c: ConnectionRow) => ({
  id: c.id,
  institution: c.institution,
  status: c.status,
  lastSyncAt: c.last_sync_at,
  lastError: c.last_error,
  createdAt: c.created_at,
});

export async function openFinanceRoutes(app: FastifyInstance, opts: { service: OpenFinanceService | null }) {
  const { pool, config } = app.deps;
  const service = opts.service;

  function requireService(): OpenFinanceService {
    if (!service) throw new HttpError(503, 'openfinance_disabled', 'Integração Open Finance não configurada');
    return service;
  }
  const providerFailure = (err: unknown): never => {
    if (err instanceof HttpError) throw err;
    app.log.error({ err }, 'falha no provedor Open Finance');
    throw new HttpError(502, 'provider_unavailable', 'O banco não respondeu. Tente de novo em instantes.');
  };

  // ---------- rotas do usuário ----------
  await app.register(async (r) => {
    r.addHook('onRequest', app.authenticate);

    r.get('/openfinance/connections', async (req) => {
      const { rows } = await pool.query<ConnectionRow>(
        `SELECT * FROM bank_connections WHERE user_id = $1 AND status <> 'rejected' ORDER BY created_at DESC`,
        [req.user.sub],
      );
      return { enabled: !!service, connections: rows.map(publicConnection) };
    });

    /** Inicia o consentimento: devolve a URL do banco para onde o app deve mandar o usuário. */
    r.post('/openfinance/connections', async (req, reply) => {
      requireService();
      const state = randomBytes(16).toString('base64url');
      const consent = await app.ofProvider!.createConsent({ redirectUri: config.OPENFINANCE_REDIRECT_URL, state }).catch(providerFailure);
      const { rows } = await pool.query<ConnectionRow>(
        `INSERT INTO bank_connections (user_id, provider, consent_id, state, institution, status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
        [req.user.sub, config.OPENFINANCE_PROVIDER, consent.consentId, state, config.OPENFINANCE_INSTITUTION],
      );
      return reply.status(201).send({ connection: publicConnection(rows[0]!), authorizeUrl: consent.authorizeUrl });
    });

    /** O banco devolveu o usuário ao app: confere o `state` e o status real no provedor. */
    r.post('/openfinance/connections/callback', async (req) => {
      const svc = requireService();
      const body = callbackBody.parse(req.body);
      const conn = await svc.getByConsent(body.consentId);
      if (!conn || conn.user_id !== req.user.sub) throw notFound('Conexão');
      const a = Buffer.from(conn.state);
      const b = Buffer.from(body.state);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(400, 'invalid_state', 'Retorno do banco inválido');
      const updated = await svc.refreshConsent(conn).catch(providerFailure);
      return { connection: publicConnection(updated) };
    });

    r.post('/openfinance/connections/:id/sync', {
      config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    }, async (req, reply) => {
      const svc = requireService();
      const { id } = idParam.parse(req.params);
      const { rows } = await pool.query<ConnectionRow>(
        `SELECT * FROM bank_connections WHERE id = $1 AND user_id = $2`, [id, req.user.sub],
      );
      if (!rows[0]) throw notFound('Conexão');
      if (rows[0].status !== 'active') throw new HttpError(409, 'not_active', 'Conexão não está ativa');
      await enqueue(pool, QUEUE_SYNC, { connectionId: id, fromDate: svc.daysAgo(7), toDate: svc.daysAgo(-1) } satisfies SyncJob);
      return reply.status(202).send({ queued: true });
    });

    /** Desconecta: revoga no banco e para de importar. Os gastos já importados ficam. */
    r.delete('/openfinance/connections/:id', async (req, reply) => {
      requireService();
      const { id } = idParam.parse(req.params);
      const { rows } = await pool.query<ConnectionRow>(
        `UPDATE bank_connections SET status = 'revoked', updated_at = now()
          WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, req.user.sub],
      );
      if (!rows[0]) throw notFound('Conexão');
      await app.ofProvider!.revokeConsent(rows[0].consent_id).catch((err) => {
        if (!(err instanceof ProviderError && err.status === 404)) app.log.warn({ err }, 'não consegui revogar no provedor');
      });
      return reply.status(204).send();
    });
  });

  // ---------- webhook do provedor ----------
  await app.register(async (r) => {
    // Precisamos do corpo cru para conferir a assinatura byte a byte.
    r.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 256 * 1024 }, (req, body, done) => {
      (req as unknown as { rawBody: string }).rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(new HttpError(400, 'invalid_json', 'JSON inválido'), undefined);
      }
    });

    /**
     * Só valida, grava e enfileira — responde em milissegundos.
     * O trabalho pesado (buscar transações, calcular imposto) fica com o worker.
     */
    r.post('/webhooks/openfinance', { config: { rateLimit: false } }, async (req, reply) => {
      requireService();
      const raw = (req as unknown as { rawBody: string }).rawBody;
      if (!verifySignature(config.OPENFINANCE_WEBHOOK_SECRET, req.headers['x-ow-signature'] as string | undefined, raw)) {
        throw new HttpError(401, 'invalid_signature', 'Assinatura inválida');
      }
      const ev = webhookBody.parse(req.body);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const ins = await client.query(
          `INSERT INTO webhook_events (provider, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [config.OPENFINANCE_PROVIDER, ev.eventId],
        );
        if (ins.rowCount) await enqueue(client, QUEUE_EVENT, ev);
        await client.query('COMMIT');
        return reply.status(202).send({ received: true, duplicate: !ins.rowCount });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    });
  });
}
