import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { checarMalha, irAnual, irMensal, parametros } from '@openwallet/tax';
import { anoAtual, anoQuery, cents, documento, isoDate, positiveCents, registrarCrud } from './crud.js';
import { carregarPerfil } from './perfil.js';

const mensalBody = z.object({
  brutoCents: cents,
  inssCents: cents.optional(),
  dependentes: z.number().int().min(0).max(20).optional(),
  pensaoAlimenticiaCents: cents.optional(),
  livroCaixaCents: cents.optional(),
  tipo: z.enum(['clt', 'autonomo']).optional(),
});

const anualBody = z.object({
  rendimentosTributaveisCents: cents,
  inssCents: cents.default(0),
  impostoPagoCents: cents.default(0),
  dependentes: z.number().int().min(0).max(20).default(0),
  saudeCents: cents.default(0),
  educacaoPorPessoaCents: z.array(cents).max(21).default([]),
  previdenciaPrivadaCents: cents.default(0),
  pensaoAlimenticiaCents: cents.default(0),
});

/** Rendimentos que entram na tabela progressiva (o lucro do MEI segue regra própria e fica fora). */
const TRIBUTAVEIS = ['salario', 'autonomo_pf', 'autonomo_pj', 'aluguel', 'outro'];

export async function irRoutes(app: FastifyInstance) {
  const { pool } = app.deps;
  app.addHook('onRequest', app.authenticate);

  app.post('/ir/simular-mensal', async (req) => ({ resultado: irMensal(mensalBody.parse(req.body)) }));
  app.post('/ir/simular-anual', async (req) => ({ resultado: irAnual(anualBody.parse(req.body)) }));

  registrarCrud(app, {
    path: '/ir/documentos',
    tabela: 'ir_documents',
    nome: 'Recibo',
    chave: 'documentos',
    ordem: 'pago_em DESC, created_at DESC',
    colunaAno: 'pago_em',
    campos: {
      tipo: { coluna: 'tipo', schema: z.enum(['saude', 'educacao', 'previdencia_privada', 'pensao_alimenticia', 'outro']), obrigatorio: true },
      valorCents: { coluna: 'valor_cents', schema: positiveCents, obrigatorio: true },
      pagoEm: { coluna: 'pago_em', schema: isoDate, obrigatorio: true },
      prestadorNome: { coluna: 'prestador_nome', schema: z.string().trim().min(1).max(120), obrigatorio: true },
      prestadorDoc: { coluna: 'prestador_doc', schema: documento },
      beneficiario: { coluna: 'beneficiario', schema: z.string().trim().min(1).max(80) },
      descricao: { coluna: 'descricao', schema: z.string().trim().max(200) },
    },
  });

  registrarCrud(app, {
    path: '/rendimentos',
    tabela: 'incomes',
    nome: 'Rendimento',
    chave: 'rendimentos',
    ordem: 'recebido_em DESC, created_at DESC',
    colunaAno: 'recebido_em',
    campos: {
      tipo: { coluna: 'tipo', schema: z.enum(['salario', 'autonomo_pf', 'autonomo_pj', 'aluguel', 'mei', 'outro']), obrigatorio: true },
      valorCents: { coluna: 'valor_cents', schema: positiveCents, obrigatorio: true },
      recebidoEm: { coluna: 'recebido_em', schema: isoDate, obrigatorio: true },
      pagadorNome: { coluna: 'pagador_nome', schema: z.string().trim().max(120) },
      pagadorDoc: { coluna: 'pagador_doc', schema: documento },
      irRetidoCents: { coluna: 'ir_retido_cents', schema: cents },
      inssCents: { coluna: 'inss_cents', schema: cents },
    },
  });

  /**
   * Prévia da declaração do ano com o que a pessoa lançou: rendimentos, recibos e carnê-leão pago.
   * Mostra completa × simplificada, restituição/imposto a pagar e os alertas de malha fina.
   */
  app.get('/ir/declaracao', async (req) => {
    const userId = req.user.sub;
    const ano = anoQuery.parse(req.query).ano ?? anoAtual();
    const [perfil, rend, docs, carne] = await Promise.all([
      carregarPerfil(pool, userId),
      pool.query<{ id: string; tipo: string; valor_cents: number; pagador_doc: string | null; ir_retido_cents: number; inss_cents: number; mes: string }>(
        `SELECT id, tipo, valor_cents, pagador_doc, ir_retido_cents, inss_cents, to_char(recebido_em, 'YYYY-MM') AS mes
           FROM incomes WHERE user_id = $1 AND recebido_em >= make_date($2,1,1) AND recebido_em < make_date($2+1,1,1)`,
        [userId, ano],
      ),
      pool.query<{ id: string; tipo: 'saude' | 'educacao' | 'previdencia_privada' | 'pensao_alimenticia' | 'outro'; valor_cents: number; prestador_doc: string | null; prestador_nome: string; beneficiario: string }>(
        `SELECT id, tipo, valor_cents, prestador_doc, prestador_nome, beneficiario
           FROM ir_documents WHERE user_id = $1 AND pago_em >= make_date($2,1,1) AND pago_em < make_date($2+1,1,1)`,
        [userId, ano],
      ),
      pool.query<{ competencia: string; valor_cents: number | null }>(
        `SELECT competencia, valor_cents FROM obligations
          WHERE user_id = $1 AND tipo = 'carne_leao' AND pago_em IS NOT NULL AND competencia LIKE $2`,
        [userId, `${ano}-%`],
      ),
    ]);

    const trib = rend.rows.filter((r) => TRIBUTAVEIS.includes(r.tipo));
    const soma = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
    const porTipo = (t: string) => soma(docs.rows.filter((d) => d.tipo === t).map((d) => d.valor_cents));
    const educacao = new Map<string, number>();
    for (const d of docs.rows.filter((x) => x.tipo === 'educacao')) {
      const k = d.beneficiario.trim().toLowerCase();
      educacao.set(k, (educacao.get(k) ?? 0) + d.valor_cents);
    }

    const entrada = {
      rendimentosTributaveisCents: soma(trib.map((r) => r.valor_cents)),
      inssCents: soma(trib.map((r) => r.inss_cents)),
      impostoPagoCents: soma(trib.map((r) => r.ir_retido_cents)) + soma(carne.rows.map((c) => c.valor_cents ?? 0)),
      dependentes: perfil.dependentes,
      saudeCents: porTipo('saude'),
      educacaoPorPessoaCents: [...educacao.values()],
      previdenciaPrivadaCents: porTipo('previdencia_privada'),
      pensaoAlimenticiaCents: porTipo('pensao_alimenticia'),
    };
    const { params, exato } = parametros(ano);
    const resultado = irAnual(entrada, params);
    const alertas = checarMalha({
      recibos: docs.rows.map((d) => ({ id: d.id, tipo: d.tipo, valorCents: d.valor_cents, documentoPrestador: d.prestador_doc, nomePrestador: d.prestador_nome, beneficiario: d.beneficiario })),
      rendimentos: trib.map((r) => ({ id: r.id, tipo: r.tipo as 'salario', valorCents: r.valor_cents, documentoPagador: r.pagador_doc, irRetidoCents: r.ir_retido_cents, mes: r.mes })),
      carneLeaoPago: carne.rows.map((c) => c.competencia),
      dependentes: [],
    });
    return {
      ano,
      exercicio: ano + 1,
      tabelaExata: exato,
      entrada,
      resultado,
      alertas,
      contagem: { rendimentos: rend.rows.length, recibos: docs.rows.length },
    };
  });
}
