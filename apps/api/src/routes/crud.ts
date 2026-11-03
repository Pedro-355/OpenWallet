import type { FastifyInstance } from 'fastify';
import { z, type ZodType } from 'zod';
import { notFound } from '../lib/errors.js';

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato AAAA-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(d + 'T00:00:00Z')), 'data inválida');
export const cents = z.number().int().min(0).max(100_000_000_000);
export const positiveCents = z.number().int().positive().max(100_000_000_000);
/** CPF/CNPJ: guarda só os dígitos. */
export const documento = z
  .string()
  .trim()
  .transform((s) => s.replace(/\D/g, ''))
  .refine((s) => s.length === 0 || s.length === 11 || s.length === 14, 'CPF (11) ou CNPJ (14 dígitos)')
  .transform((s) => s || null);
export const anoQuery = z.object({ ano: z.coerce.number().int().min(2000).max(2100).optional() });
export const idParam = z.object({ id: z.string().uuid() });

export function anoAtual(): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date()));
}

export function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

interface Campo {
  coluna: string;
  schema: ZodType;
  obrigatorio?: boolean;
}

export interface CrudSpec {
  /** Caminho base, ex.: '/ir/documentos'. */
  path: string;
  /** Nome da tabela (constante do código, nunca vinda do usuário). */
  tabela: string;
  /** Nome no singular para mensagens ("Recibo não encontrado"). */
  nome: string;
  /** Chave da lista na resposta, ex.: 'documentos'. */
  chave: string;
  campos: Record<string, Campo>;
  ordem: string;
  /** Coluna de data usada no filtro ?ano=. */
  colunaAno?: string;
  /** Chamado depois de qualquer alteração (ex.: invalidar cache). */
  depois?: (userId: string) => Promise<void>;
}

/** Monta listar/criar/alterar/apagar para uma tabela simples de um usuário. */
export function registrarCrud(app: FastifyInstance, spec: CrudSpec) {
  const { pool } = app.deps;
  const entradas = Object.entries(spec.campos);
  const criar = z.object(Object.fromEntries(entradas.map(([k, c]) => [k, c.obrigatorio ? c.schema : c.schema.optional()])));
  const alterar = z
    .object(Object.fromEntries(entradas.map(([k, c]) => [k, c.schema.optional()])))
    .refine((b) => Object.values(b).some((v) => v !== undefined), 'nada para atualizar');
  const select = ['id', 'created_at', ...entradas.map(([, c]) => c.coluna)].join(', ');
  const toApi = (r: Record<string, unknown>) => ({
    id: r.id,
    createdAt: r.created_at,
    ...Object.fromEntries(entradas.map(([k, c]) => [k, r[c.coluna] ?? null])),
  });

  app.get(spec.path, async (req) => {
    const { ano } = anoQuery.parse(req.query);
    const params: unknown[] = [req.user.sub];
    let where = 'user_id = $1';
    if (ano && spec.colunaAno) where += ` AND ${spec.colunaAno} >= make_date($${params.push(ano)}, 1, 1) AND ${spec.colunaAno} < make_date($${params.length} + 1, 1, 1)`;
    const { rows } = await pool.query(`SELECT ${select} FROM ${spec.tabela} WHERE ${where} ORDER BY ${spec.ordem} LIMIT 500`, params);
    return { [spec.chave]: rows.map(toApi) };
  });

  app.post(spec.path, async (req, reply) => {
    const body = criar.parse(req.body) as Record<string, unknown>;
    const usados = entradas.filter(([k]) => body[k] !== undefined);
    const cols = ['user_id', ...usados.map(([, c]) => c.coluna)];
    const vals = [req.user.sub, ...usados.map(([k]) => body[k])];
    const { rows } = await pool.query(
      `INSERT INTO ${spec.tabela} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${select}`,
      vals,
    );
    await spec.depois?.(req.user.sub);
    return reply.status(201).send({ item: toApi(rows[0]) });
  });

  app.patch(`${spec.path}/:id`, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = alterar.parse(req.body) as Record<string, unknown>;
    const usados = entradas.filter(([k]) => body[k] !== undefined);
    const sets = usados.map(([, c], i) => `${c.coluna} = $${i + 3}`);
    const { rows } = await pool.query(
      `UPDATE ${spec.tabela} SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING ${select}`,
      [req.user.sub, id, ...usados.map(([k]) => body[k])],
    );
    if (!rows[0]) throw notFound(spec.nome);
    await spec.depois?.(req.user.sub);
    return { item: toApi(rows[0]) };
  });

  app.delete(`${spec.path}/:id`, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rowCount } = await pool.query(`DELETE FROM ${spec.tabela} WHERE user_id = $1 AND id = $2`, [req.user.sub, id]);
    if (!rowCount) throw notFound(spec.nome);
    await spec.depois?.(req.user.sub);
    return reply.status(204).send();
  });
}

export function addDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
