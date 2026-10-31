import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UFS } from '@openwallet/tax';
import { DUMMY_HASH, hashPassword, newOpaqueToken, sha256, verifyPassword } from '../lib/crypto.js';
import { conflict, notFound, unauthorized } from '../lib/errors.js';

const ufSchema = z.enum(UFS);
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, 'mínimo de 8 caracteres').max(200);

const registerBody = z.object({ email, password, uf: ufSchema });
const loginBody = z.object({ email, password: z.string().min(1).max(200) });
const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });
const patchMeBody = z.object({ uf: ufSchema });

interface UserRow {
  id: string;
  email: string;
  uf: string;
  created_at: Date;
}
const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, uf: u.uf, createdAt: u.created_at });

export async function authRoutes(app: FastifyInstance) {
  const { pool, config } = app.deps;
  const authLimit = {
    rateLimit: { max: config.AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute', keyGenerator: (req: { ip: string }) => `auth:${req.ip}` },
  };

  async function issueTokens(userId: string) {
    const refreshToken = newOpaqueToken();
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(days => $3))`,
      [userId, sha256(refreshToken), config.REFRESH_TOKEN_TTL_DAYS],
    );
    return { accessToken: app.jwt.sign({ sub: userId }), refreshToken };
  }

  app.post('/auth/register', { config: authLimit }, async (req, reply) => {
    const body = registerBody.parse(req.body);
    const hash = await hashPassword(body.password);
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (email, password_hash, uf) VALUES ($1, $2, $3)
       ON CONFLICT ((lower(email))) DO NOTHING
       RETURNING id, email, uf, created_at`,
      [body.email, hash, body.uf],
    );
    const user = rows[0];
    if (!user) throw conflict('Este e-mail já está cadastrado');
    return reply.status(201).send({ user: publicUser(user), ...(await issueTokens(user.id)) });
  });

  app.post('/auth/login', { config: authLimit }, async (req) => {
    const body = loginBody.parse(req.body);
    const { rows } = await pool.query<UserRow & { password_hash: string }>(
      'SELECT id, email, uf, created_at, password_hash FROM users WHERE lower(email) = $1',
      [body.email],
    );
    const user = rows[0];
    const ok = await verifyPassword(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized('E-mail ou senha incorretos');
    return { user: publicUser(user), ...(await issueTokens(user.id)) };
  });

  /** Troca o refresh token por um novo par (rotação). Reuso de token antigo derruba todas as sessões. */
  app.post('/auth/refresh', { config: authLimit }, async (req) => {
    const { refreshToken } = refreshBody.parse(req.body);
    const hash = sha256(refreshToken);
    const { rows } = await pool.query<{ user_id: string; valid: boolean }>(
      `WITH s AS (SELECT id, user_id, revoked_at IS NULL AND expires_at > now() AS valid
                  FROM sessions WHERE token_hash = $1 FOR UPDATE)
       UPDATE sessions SET revoked_at = COALESCE(sessions.revoked_at, now())
       FROM s WHERE sessions.id = s.id
       RETURNING s.user_id, s.valid`,
      [hash],
    );
    const row = rows[0];
    if (!row) throw unauthorized('Sessão inválida');
    if (!row.valid) {
      // Token já usado ou expirado: possível roubo. Revoga tudo do usuário.
      await pool.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [row.user_id]);
      throw unauthorized('Sessão expirada. Entre novamente.');
    }
    return issueTokens(row.user_id);
  });

  app.post('/auth/logout', async (req, reply) => {
    const { refreshToken } = refreshBody.parse(req.body);
    await pool.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(refreshToken)]);
    return reply.status(204).send();
  });

  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    const { rows } = await pool.query<UserRow>('SELECT id, email, uf, created_at FROM users WHERE id = $1', [req.user.sub]);
    if (!rows[0]) throw notFound('Usuário');
    return { user: publicUser(rows[0]) };
  });

  app.patch('/me', { onRequest: [app.authenticate] }, async (req) => {
    const body = patchMeBody.parse(req.body);
    const { rows } = await pool.query<UserRow>(
      'UPDATE users SET uf = $2, updated_at = now() WHERE id = $1 RETURNING id, email, uf, created_at',
      [req.user.sub, body.uf],
    );
    if (!rows[0]) throw notFound('Usuário');
    return { user: publicUser(rows[0]) };
  });
}
