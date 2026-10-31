import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UFS, calculateTax, type UF } from '@openwallet/tax';
import { HttpError, notFound } from '../lib/errors.js';

const MAX_CENTS = 100_000_000_000; // R$ 1 bilhão

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato AAAA-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(d + 'T00:00:00Z')), 'data inválida');

const createBody = z.object({
  amountCents: z.number().int().positive().max(MAX_CENTS),
  category: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).default(''),
  /** UF onde a compra foi feita; se omitida, usa a UF do perfil. */
  uf: z.enum(UFS).optional(),
  spentOn: isoDate,
});
const updateBody = createBody.partial().refine((b) => Object.keys(b).length > 0, 'nada para atualizar');

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(200).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: z.string().max(40).optional(),
});

const idParam = z.object({ id: z.string().uuid() });
const idempotencyKey = z.string().min(8).max(100).optional();

export interface ExpenseRow {
  id: string;
  amount_cents: number;
  category: string;
  description: string;
  uf: string;
  spent_on: string;
  tax_federal_cents: number;
  tax_estadual_cents: number;
  tax_municipal_cents: number;
  tax_total_cents: number;
  tax_rate_pct: number;
  rates_version: string;
  created_at: Date;
}

const COLUMNS = `id, amount_cents, category, description, uf, spent_on,
  tax_federal_cents, tax_estadual_cents, tax_municipal_cents, tax_total_cents,
  tax_rate_pct, rates_version, created_at`;

export function toExpense(r: ExpenseRow) {
  return {
    id: r.id,
    amountCents: r.amount_cents,
    category: r.category,
    description: r.description,
    uf: r.uf,
    spentOn: r.spent_on,
    tax: {
      federalCents: r.tax_federal_cents,
      estadualCents: r.tax_estadual_cents,
      municipalCents: r.tax_municipal_cents,
      totalCents: r.tax_total_cents,
      ratePct: r.tax_rate_pct,
      ratesVersion: r.rates_version,
    },
    createdAt: r.created_at,
  };
}

const encodeCursor = (r: ExpenseRow) => Buffer.from(`${r.spent_on}|${r.id}`).toString('base64url');
function decodeCursor(c: string): [string, string] {
  const [date, id] = Buffer.from(c, 'base64url').toString().split('|');
  if (!date || !id || !isoDate.safeParse(date).success || !z.string().uuid().safeParse(id).success) {
    throw new HttpError(400, 'invalid_cursor', 'Cursor inválido');
  }
  return [date, id];
}

export async function expenseRoutes(app: FastifyInstance) {
  const { pool, rates } = app.deps;
  app.addHook('onRequest', app.authenticate);

  async function userUf(userId: string): Promise<UF> {
    const { rows } = await pool.query<{ uf: UF }>('SELECT uf FROM users WHERE id = $1', [userId]);
    if (!rows[0]) throw new HttpError(401, 'unauthorized', 'Usuário não existe mais');
    return rows[0].uf;
  }

  app.post('/expenses', async (req, reply) => {
    const userId = req.user.sub;
    const body = createBody.parse(req.body);
    const key = idempotencyKey.parse(req.headers['idempotency-key']);
    const uf = body.uf ?? (await userUf(userId));
    const tax = calculateTax(rates, { amountCents: body.amountCents, category: body.category, uf });

    const { rows } = await pool.query<ExpenseRow>(
      `INSERT INTO expenses (user_id, amount_cents, category, description, uf, spent_on,
         tax_federal_cents, tax_estadual_cents, tax_municipal_cents, tax_total_cents,
         tax_rate_pct, rates_version, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING ${COLUMNS}`,
      [userId, body.amountCents, tax.category, body.description, uf, body.spentOn,
        tax.federalCents, tax.estadualCents, tax.municipalCents, tax.totalCents,
        tax.ratePct, tax.ratesVersion, key ?? null],
    );

    if (!rows[0]) {
      // Mesmo Idempotency-Key já usado: devolve o gasto original em vez de duplicar.
      const existing = await pool.query<ExpenseRow>(
        `SELECT ${COLUMNS} FROM expenses WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, key],
      );
      if (!existing.rows[0]) throw new HttpError(409, 'conflict', 'Tente novamente');
      return reply.status(200).header('idempotent-replay', 'true').send({ expense: toExpense(existing.rows[0]) });
    }
    await app.cache.bumpUser(userId);
    return reply.status(201).send({ expense: toExpense(rows[0]) });
  });

  app.get('/expenses', async (req) => {
    const userId = req.user.sub;
    const q = listQuery.parse(req.query);
    const params: unknown[] = [userId];
    const where = ['user_id = $1'];
    if (q.from) where.push(`spent_on >= $${params.push(q.from)}`);
    if (q.to) where.push(`spent_on <= $${params.push(q.to)}`);
    if (q.category) where.push(`category = $${params.push(q.category)}`);
    if (q.cursor) {
      const [d, id] = decodeCursor(q.cursor);
      // Paginação por chave (keyset): custo constante mesmo na página 1000, ao contrário de OFFSET.
      where.push(`(spent_on, id) < ($${params.push(d)}::date, $${params.push(id)}::uuid)`);
    }
    params.push(q.limit + 1);
    const { rows } = await pool.query<ExpenseRow>(
      `SELECT ${COLUMNS} FROM expenses WHERE ${where.join(' AND ')}
       ORDER BY spent_on DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const last = page[page.length - 1];
    return { items: page.map(toExpense), nextCursor: hasMore && last ? encodeCursor(last) : null };
  });

  app.get('/expenses/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query<ExpenseRow>(
      `SELECT ${COLUMNS} FROM expenses WHERE user_id = $1 AND id = $2`,
      [req.user.sub, id],
    );
    if (!rows[0]) throw notFound('Gasto');
    return { expense: toExpense(rows[0]) };
  });

  app.patch('/expenses/:id', async (req) => {
    const userId = req.user.sub;
    const { id } = idParam.parse(req.params);
    const body = updateBody.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query<ExpenseRow>(
        `SELECT ${COLUMNS} FROM expenses WHERE user_id = $1 AND id = $2 FOR UPDATE`,
        [userId, id],
      );
      const old = cur.rows[0];
      if (!old) throw notFound('Gasto');
      const next = {
        amountCents: body.amountCents ?? old.amount_cents,
        category: body.category ?? old.category,
        description: body.description ?? old.description,
        uf: (body.uf ?? old.uf) as UF,
        spentOn: body.spentOn ?? old.spent_on,
      };
      // Valor, categoria ou UF mudaram: recalcula o imposto com a tabela atual.
      const tax = calculateTax(rates, next);
      const { rows } = await client.query<ExpenseRow>(
        `UPDATE expenses SET amount_cents=$3, category=$4, description=$5, uf=$6, spent_on=$7,
           tax_federal_cents=$8, tax_estadual_cents=$9, tax_municipal_cents=$10, tax_total_cents=$11,
           tax_rate_pct=$12, rates_version=$13, updated_at=now()
         WHERE user_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
        [userId, id, next.amountCents, tax.category, next.description, next.uf, next.spentOn,
          tax.federalCents, tax.estadualCents, tax.municipalCents, tax.totalCents, tax.ratePct, tax.ratesVersion],
      );
      await client.query('COMMIT');
      await app.cache.bumpUser(userId);
      return { expense: toExpense(rows[0]!) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  app.delete('/expenses/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rowCount } = await pool.query('DELETE FROM expenses WHERE user_id = $1 AND id = $2', [req.user.sub, id]);
    if (!rowCount) throw notFound('Gasto');
    await app.cache.bumpUser(req.user.sub);
    return reply.status(204).send();
  });
}
