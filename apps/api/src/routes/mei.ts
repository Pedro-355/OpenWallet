import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { compararRegimes, dasMei, statusLimiteMei } from '@openwallet/tax';
import { HttpError, notFound } from '../lib/errors.js';
import { anoAtual, anoQuery, documento, hojeISO, idParam, isoDate, positiveCents } from './crud.js';
import type { NfseProvider } from '../lib/gov-providers.js';
import { carregarPerfil } from './perfil.js';

const emitirBody = z.object({
  tomadorNome: z.string().trim().min(1).max(120),
  tomadorDoc: documento.optional(),
  descricao: z.string().trim().min(3).max(500),
  valorCents: positiveCents,
  emitidaEm: isoDate.optional(),
});
const compararQuery = z.object({
  faturamentoAnualCents: z.coerce.number().int().min(0).max(100_000_000_000),
  atividade: z.enum(['comercio', 'servicos', 'comercio_servicos']).default('servicos'),
});

interface NotaMeiRow {
  id: string;
  numero: number;
  chave: string;
  tomador_nome: string;
  tomador_doc: string | null;
  descricao: string;
  valor_cents: number;
  emitida_em: string;
  status: 'emitida' | 'cancelada';
  provider: string;
}
const toNota = (r: NotaMeiRow) => ({
  id: r.id,
  numero: r.numero,
  chave: r.chave,
  tomadorNome: r.tomador_nome,
  tomadorDoc: r.tomador_doc,
  descricao: r.descricao,
  valorCents: r.valor_cents,
  emitidaEm: r.emitida_em,
  status: r.status,
  ambiente: r.provider === 'sandbox' ? 'teste' : 'producao',
});

export async function meiRoutes(app: FastifyInstance, opts: { nfse: NfseProvider }) {
  const { pool } = app.deps;
  app.addHook('onRequest', app.authenticate);

  /** Faturamento do ano (notas emitidas + recebimentos lançados como MEI), limite, DAS e alertas. */
  app.get('/mei/painel', async (req) => {
    const userId = req.user.sub;
    const ano = anoQuery.parse(req.query).ano ?? anoAtual();
    const perfil = await carregarPerfil(pool, userId);
    const { rows } = await pool.query<{ notas: number; outros: number; mes: string }>(
      `SELECT
         (SELECT coalesce(sum(valor_cents),0)::bigint FROM mei_invoices
           WHERE user_id = $1 AND status = 'emitida' AND emitida_em >= make_date($2,1,1) AND emitida_em < make_date($2+1,1,1)) AS notas,
         (SELECT coalesce(sum(valor_cents),0)::bigint FROM incomes
           WHERE user_id = $1 AND tipo = 'mei' AND recebido_em >= make_date($2,1,1) AND recebido_em < make_date($2+1,1,1)) AS outros`,
      [userId, ano],
    );
    const faturado = (rows[0]?.notas ?? 0) + (rows[0]?.outros ?? 0);
    const hoje = hojeISO();
    const mesAtual = Number(hoje.slice(0, 4)) === ano ? Number(hoje.slice(5, 7)) : Number(hoje.slice(0, 4)) > ano ? 12 : 1;
    return {
      ano,
      ativo: perfil.mei,
      atividade: perfil.meiAtividade,
      faturamento: { notasCents: rows[0]?.notas ?? 0, outrosCents: rows[0]?.outros ?? 0, totalCents: faturado },
      limite: statusLimiteMei({ faturadoNoAnoCents: faturado, ano, mesAtual, abertura: perfil.meiAbertura }),
      das: dasMei(perfil.meiAtividade ?? 'servicos'),
    };
  });

  app.get('/mei/notas', async (req) => {
    const ano = anoQuery.parse(req.query).ano ?? anoAtual();
    const { rows } = await pool.query<NotaMeiRow>(
      `SELECT * FROM mei_invoices WHERE user_id = $1 AND emitida_em >= make_date($2,1,1) AND emitida_em < make_date($2+1,1,1)
        ORDER BY numero DESC LIMIT 200`,
      [req.user.sub, ano],
    );
    return { notas: rows.map(toNota) };
  });

  /** Emite uma NFS-e. A numeração é sequencial por usuário (trava por usuário evita número repetido). */
  app.post('/mei/notas', async (req, reply) => {
    const userId = req.user.sub;
    const b = emitirBody.parse(req.body);
    const perfil = await carregarPerfil(pool, userId);
    if (!perfil.mei) throw new HttpError(409, 'nao_e_mei', 'Ative o MEI no seu perfil para emitir notas.');
    const emitidaEm = b.emitidaEm ?? hojeISO();
    if (emitidaEm > hojeISO()) throw new HttpError(400, 'data_futura', 'A nota não pode ter data futura.');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`mei:${userId}`]);
      const { rows: n } = await client.query<{ prox: number }>('SELECT coalesce(max(numero),0)::bigint + 1 AS prox FROM mei_invoices WHERE user_id = $1', [userId]);
      const numero = n[0]!.prox;
      const emitida = await opts.nfse.emitir({ userId, numero, valorCents: b.valorCents, tomadorDoc: b.tomadorDoc ?? null, descricao: b.descricao, emitidaEm });
      const { rows } = await client.query<NotaMeiRow>(
        `INSERT INTO mei_invoices (user_id, numero, chave, tomador_nome, tomador_doc, descricao, valor_cents, emitida_em, provider)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [userId, numero, emitida.chave, b.tomadorNome, b.tomadorDoc ?? null, b.descricao, b.valorCents, emitidaEm, emitida.provider],
      );
      await client.query('COMMIT');
      return reply.status(201).send({ nota: toNota(rows[0]!) });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/mei/notas/:id/cancelar', async (req) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query<NotaMeiRow>('SELECT * FROM mei_invoices WHERE user_id = $1 AND id = $2', [req.user.sub, id]);
    const nota = rows[0];
    if (!nota) throw notFound('Nota');
    if (nota.status === 'cancelada') return { nota: toNota(nota) };
    await opts.nfse.cancelar(nota.chave);
    const upd = await pool.query<NotaMeiRow>(`UPDATE mei_invoices SET status = 'cancelada' WHERE id = $1 RETURNING *`, [id]);
    return { nota: toNota(upd.rows[0]!) };
  });

  app.get('/mei/comparar', async (req) => {
    const q = compararQuery.parse(req.query);
    return { opcoes: compararRegimes(q), observacao: 'Estimativa anual. ISS municipal do autônomo e taxas locais não entram na conta.' };
  });

}
