import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { avistaOuParcelado, dasMei, vencimentosRecorrentes } from '@openwallet/tax';
import { HttpError, notFound } from '../lib/errors.js';
import { addDiasISO, cents, hojeISO, idParam, isoDate, positiveCents } from './crud.js';
import { carregarPerfil } from './perfil.js';

const periodo = z.object({ de: isoDate.optional(), ate: isoDate.optional() });

const criarBody = z.object({
  tipo: z.enum(['ipva', 'iptu', 'outro']),
  titulo: z.string().trim().min(1).max(120),
  vencimento: isoDate,
  valorCents: cents.optional(),
  descontoAvistaPct: z.number().min(0).max(100).optional(),
  parcelas: z.number().int().min(1).max(24).optional(),
});
const pagarBody = z.object({ pago: z.boolean(), valorCents: cents.optional() });
const recorrenteBody = z.object({
  tipo: z.enum(['das_mei', 'carne_leao', 'dasn_simei', 'dirpf']),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  vencimento: isoDate,
  pago: z.boolean(),
  valorCents: cents.optional(),
});
const calcBody = z.object({
  valorCents: positiveCents,
  descontoAvistaPct: z.number().min(0).max(100),
  parcelas: z.number().int().min(1).max(24),
  rendimentoMensalPct: z.number().min(0).max(20).default(1),
});

interface ObrigacaoRow {
  id: string;
  tipo: string;
  titulo: string;
  vencimento: string;
  competencia: string | null;
  valor_cents: number | null;
  desconto_avista_pct: number | null;
  parcelas: number | null;
  pago_em: string | null;
}

/** Competência de obrigações anuais (DASN, DIRPF) usa o ano anterior, ex.: '2026-12' para a declaração de maio/2027. */
const competenciaAnual = (vencimento: string) => `${Number(vencimento.slice(0, 4)) - 1}-12`;

export async function agendaRoutes(app: FastifyInstance) {
  const { pool } = app.deps;
  app.addHook('onRequest', app.authenticate);

  /** Próximos vencimentos (padrão: 30 dias para trás até 120 dias para frente). */
  app.get('/agenda', async (req) => {
    const userId = req.user.sub;
    const hoje = hojeISO();
    const q = periodo.parse(req.query);
    const de = q.de ?? addDiasISO(hoje, -30);
    const ate = q.ate ?? addDiasISO(hoje, 120);
    if (ate < de) throw new HttpError(400, 'periodo_invalido', 'A data final vem antes da inicial.');

    const perfil = await carregarPerfil(pool, userId);
    const { rows } = await pool.query<ObrigacaoRow>(
      `SELECT id, tipo, titulo, vencimento, competencia, valor_cents, desconto_avista_pct, parcelas, pago_em
         FROM obligations WHERE user_id = $1 AND ((vencimento BETWEEN $2 AND $3) OR competencia IS NOT NULL)`,
      [userId, de, ate],
    );
    const marcas = new Map(rows.filter((r) => r.competencia).map((r) => [`${r.tipo}|${r.competencia}`, r]));
    const das = perfil.meiAtividade ? dasMei(perfil.meiAtividade).totalCents : null;

    const automaticos = vencimentosRecorrentes({ mei: perfil.mei, carneLeao: perfil.carneLeao, declaraIr: perfil.declaraIr }, de, ate).map((v) => {
      const competencia = v.competencia ?? competenciaAnual(v.vencimento);
      const marca = marcas.get(`${v.tipo}|${competencia}`);
      return {
        id: null as string | null,
        origem: 'automatica' as const,
        tipo: v.tipo,
        titulo: v.titulo,
        vencimento: v.vencimento,
        competencia,
        valorCents: marca?.valor_cents ?? (v.tipo === 'das_mei' ? das : null),
        pago: !!marca?.pago_em,
        pagoEm: marca?.pago_em ?? null,
        previsto: v.previsto ?? false,
        dica: v.dica,
        atrasado: !marca?.pago_em && v.vencimento < hoje,
        descontoAvistaPct: null as number | null,
        parcelas: null as number | null,
      };
    });
    const manuais = rows
      .filter((r) => !r.competencia && r.vencimento >= de && r.vencimento <= ate)
      .map((r) => ({
        id: r.id,
        origem: 'manual' as const,
        tipo: r.tipo,
        titulo: r.titulo,
        vencimento: r.vencimento,
        competencia: null,
        valorCents: r.valor_cents,
        pago: !!r.pago_em,
        pagoEm: r.pago_em,
        previsto: false,
        dica: r.tipo === 'ipva' || r.tipo === 'iptu' ? 'Compare à vista e parcelado antes de pagar.' : '',
        atrasado: !r.pago_em && r.vencimento < hoje,
        descontoAvistaPct: r.desconto_avista_pct,
        parcelas: r.parcelas,
      }));
    const itens = [...automaticos, ...manuais].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    return {
      de,
      ate,
      itens,
      resumo: {
        atrasados: itens.filter((i) => i.atrasado).length,
        proximos7dias: itens.filter((i) => !i.pago && i.vencimento >= hoje && i.vencimento <= addDiasISO(hoje, 7)).length,
      },
    };
  });

  app.post('/agenda', async (req, reply) => {
    const b = criarBody.parse(req.body);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO obligations (user_id, tipo, titulo, vencimento, valor_cents, desconto_avista_pct, parcelas)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user.sub, b.tipo, b.titulo, b.vencimento, b.valorCents ?? null, b.descontoAvistaPct ?? null, b.parcelas ?? null],
    );
    return reply.status(201).send({ id: rows[0]!.id });
  });

  app.patch('/agenda/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const b = pagarBody.parse(req.body);
    const { rows } = await pool.query<{ id: string; pago_em: string | null }>(
      `UPDATE obligations SET pago_em = $3, valor_cents = COALESCE($4, valor_cents)
        WHERE user_id = $1 AND id = $2 AND competencia IS NULL RETURNING id, pago_em`,
      [req.user.sub, id, b.pago ? hojeISO() : null, b.valorCents ?? null],
    );
    if (!rows[0]) throw notFound('Compromisso');
    return { id: rows[0].id, pagoEm: rows[0].pago_em };
  });

  app.delete('/agenda/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { rowCount } = await pool.query('DELETE FROM obligations WHERE user_id = $1 AND id = $2 AND competencia IS NULL', [req.user.sub, id]);
    if (!rowCount) throw notFound('Compromisso');
    return reply.status(204).send();
  });

  /** Marca (ou desmarca) uma obrigação automática como paga. O valor pago entra no IR (carnê-leão) e no impostômetro. */
  app.post('/agenda/recorrentes', async (req) => {
    const b = recorrenteBody.parse(req.body);
    const titulos = { das_mei: 'DAS do MEI', carne_leao: 'Carnê-leão', dasn_simei: 'DASN-SIMEI', dirpf: 'Declaração do IR' };
    if (!b.pago) {
      await pool.query('DELETE FROM obligations WHERE user_id = $1 AND tipo = $2 AND competencia = $3', [req.user.sub, b.tipo, b.competencia]);
      return { pago: false };
    }
    await pool.query(
      `INSERT INTO obligations (user_id, tipo, titulo, vencimento, competencia, valor_cents, pago_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, tipo, competencia) WHERE competencia IS NOT NULL
       DO UPDATE SET pago_em = EXCLUDED.pago_em, valor_cents = COALESCE(EXCLUDED.valor_cents, obligations.valor_cents)`,
      [req.user.sub, b.tipo, titulos[b.tipo], b.vencimento, b.competencia, b.valorCents ?? null, hojeISO()],
    );
    return { pago: true };
  });

  app.post('/agenda/avista-ou-parcelado', async (req) => ({ resultado: avistaOuParcelado(calcBody.parse(req.body)) }));
}
