import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { elegibilidadeCashback, estimarCashback, impostometroAnual, inssEmpregado, irMensal } from '@openwallet/tax';
import { notFound } from '../lib/errors.js';
import { anoAtual, anoQuery, hojeISO, idParam, isoDate, positiveCents, registrarCrud } from './crud.js';
import type { PendenciasProvider } from '../lib/gov-providers.js';
import { perguntarModelo, type LlmConfig } from '../lib/assistente-llm.js';
import { buscar, montarPrompt, respostaLocal, type Corpus, type RespostaAssistente } from '../services/assistente-rules.js';
import { carregarPerfil } from './perfil.js';

export function carregarCorpus(): Corpus {
  return JSON.parse(readFileSync(new URL('../../data/assistente.json', import.meta.url), 'utf8')) as Corpus;
}

const perguntaBody = z.object({ pergunta: z.string().trim().min(3).max(500) });
const contadoresQuery = z.object({ uf: z.string().length(2).toUpperCase().optional(), tema: z.string().max(40).optional() });
const contatoBody = z.object({
  assunto: z.enum(['irpf', 'malha_fina', 'mei', 'abertura_empresa', 'dividas', 'carne_leao', 'outro']),
  mensagem: z.string().trim().min(10).max(1000),
});

export async function extrasRoutes(app: FastifyInstance, opts: { pendencias: PendenciasProvider; llm: LlmConfig | null; corpus: Corpus }) {
  const { pool, config } = app.deps;
  app.addHook('onRequest', app.authenticate);

  /**
   * Impostômetro do ano: consumo (gastos), IR, INSS e IPVA/IPTU.
   * Sem rendimentos lançados, IR e INSS são estimados pela renda mensal do perfil (só para CLT).
   */
  app.get('/impostometro/anual', async (req) => {
    const userId = req.user.sub;
    const ano = anoQuery.parse(req.query).ano ?? anoAtual();
    const [perfil, consumo, rend, patr, carne] = await Promise.all([
      carregarPerfil(pool, userId),
      pool.query<{ tax: number }>(
        `SELECT coalesce(sum(tax_total_cents),0)::bigint AS tax FROM expenses
          WHERE user_id = $1 AND spent_on >= make_date($2,1,1) AND spent_on < make_date($2+1,1,1)`,
        [userId, ano],
      ),
      pool.query<{ n: number; bruto: number; ir: number; inss: number }>(
        `SELECT count(*)::int AS n, coalesce(sum(valor_cents),0)::bigint AS bruto,
                coalesce(sum(ir_retido_cents),0)::bigint AS ir, coalesce(sum(inss_cents),0)::bigint AS inss
           FROM incomes WHERE user_id = $1 AND recebido_em >= make_date($2,1,1) AND recebido_em < make_date($2+1,1,1)`,
        [userId, ano],
      ),
      pool.query<{ v: number }>(
        `SELECT coalesce(sum(valor_cents),0)::bigint AS v FROM obligations
          WHERE user_id = $1 AND tipo IN ('ipva','iptu') AND pago_em >= make_date($2,1,1) AND pago_em < make_date($2+1,1,1)`,
        [userId, ano],
      ),
      pool.query<{ carne: number; das: number }>(
        `SELECT coalesce(sum(valor_cents) FILTER (WHERE tipo = 'carne_leao'),0)::bigint AS carne,
                coalesce(sum(valor_cents) FILTER (WHERE tipo = 'das_mei'),0)::bigint AS das
           FROM obligations WHERE user_id = $1 AND pago_em IS NOT NULL AND competencia LIKE $2`,
        [userId, `${ano}-%`],
      ),
    ]);

    const r = rend.rows[0]!;
    const hoje = hojeISO();
    const meses = Number(hoje.slice(0, 4)) === ano ? Number(hoje.slice(5, 7)) : 12;
    let estimado = false;
    let renda = r.bruto;
    const pagos = carne.rows[0]!;
    let ir = r.ir + pagos.carne;
    let inss = r.inss;
    if (r.n === 0 && perfil.rendaMensalCents > 0) {
      estimado = true;
      renda = perfil.rendaMensalCents * meses;
      if (perfil.tipoRenda === 'clt') {
        inss = inssEmpregado(perfil.rendaMensalCents) * meses;
        ir = irMensal({ brutoCents: perfil.rendaMensalCents }).impostoCents * meses + pagos.carne;
      }
    }
    return {
      ...impostometroAnual({ ano, rendaBrutaCents: renda, consumoCents: consumo.rows[0]!.tax, irCents: ir, inssCents: inss, patrimonioCents: patr.rows[0]!.v, outrosCents: pagos.das }),
      estimado,
      mesesConsiderados: meses,
    };
  });

  /** Cashback da reforma: elegibilidade e quanto voltaria com os gastos do ano. */
  app.get('/cashback', async (req) => {
    const userId = req.user.sub;
    const ano = anoQuery.parse(req.query).ano ?? anoAtual();
    const perfil = await carregarPerfil(pool, userId);
    const { rows } = await pool.query<{ category: string; amount_cents: number; spent_on: string; cpf_na_nota: boolean | null }>(
      `SELECT category, amount_cents, spent_on, cpf_na_nota FROM expenses
        WHERE user_id = $1 AND spent_on >= make_date($2,1,1) AND spent_on < make_date($2+1,1,1)`,
      [userId, ano],
    );
    const elegibilidade = elegibilidadeCashback({
      inscritoCadUnico: perfil.cadunico,
      pessoasNaFamilia: perfil.pessoasFamilia,
      rendaFamiliarMensalCents: perfil.rendaFamiliarCents,
    });
    const estimativa = estimarCashback(rows.map((x) => ({ categoria: x.category, valorCents: x.amount_cents, data: x.spent_on, cpfNaNota: x.cpf_na_nota })));
    return { ano, perfilPreenchido: perfil.preenchido, elegibilidade, estimativa, gastosConsiderados: rows.length };
  });

  registrarCrud(app, {
    path: '/creditos',
    tabela: 'credits',
    nome: 'Crédito',
    chave: 'creditos',
    ordem: "status = 'recebido', previsto_para NULLS LAST, created_at DESC",
    campos: {
      origem: { coluna: 'origem', schema: z.enum(['restituicao_ir', 'nota_fiscal_estadual', 'valores_a_receber', 'cashback', 'outro']), obrigatorio: true },
      descricao: { coluna: 'descricao', schema: z.string().trim().max(200) },
      valorCents: { coluna: 'valor_cents', schema: positiveCents, obrigatorio: true },
      previstoPara: { coluna: 'previsto_para', schema: isoDate.nullable() },
      status: { coluna: 'status', schema: z.enum(['previsto', 'recebido']) },
    },
  });

  app.get('/pendencias', async (req) => ({
    ambiente: opts.pendencias.nome === 'sandbox' ? 'teste' : 'producao',
    pendencias: await opts.pendencias.consultar(req.user.sub),
    ondeConferir: [
      { nome: 'Regularize (PGFN) — dívida ativa da União', url: 'https://www.regularize.pgfn.gov.br' },
      { nome: 'e-CAC (Receita Federal)', url: 'https://cav.receita.fazenda.gov.br' },
      { nome: 'Valores a Receber (Banco Central)', url: 'https://valoresareceber.bcb.gov.br' },
    ],
  }));

  app.post('/assistente', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req): Promise<RespostaAssistente> => {
    const { pergunta } = perguntaBody.parse(req.body);
    const achados = buscar(opts.corpus, pergunta, 4);
    if (opts.llm && achados.length) {
      try {
        const resposta = await perguntarModelo(opts.llm, montarPrompt(pergunta, achados));
        return {
          resposta,
          fontes: achados.map((a) => ({ id: a.trecho.id, fonte: a.trecho.fonte, titulo: a.trecho.titulo })),
          modo: 'modelo',
          aviso: opts.corpus.aviso,
        };
      } catch (err) {
        req.log.warn({ err }, 'assistente: modelo indisponível, respondendo pela busca');
      }
    }
    return respostaLocal(opts.corpus, achados);
  });

  app.get('/contadores', async (req) => {
    const q = contadoresQuery.parse(req.query);
    const params: unknown[] = [];
    const where = ['ativo'];
    if (!config.MOSTRAR_EXEMPLOS) where.push('NOT exemplo');
    if (q.uf) where.push(`(uf = $${params.push(q.uf)} OR atende_online)`);
    if (q.tema) where.push(`$${params.push(q.tema)} = ANY(especialidades)`);
    const { rows } = await pool.query<{ id: string; nome: string; crc: string; uf: string; cidade: string; especialidades: string[]; preco_consulta_cents: number; atende_online: boolean; exemplo: boolean }>(
      `SELECT id, nome, crc, uf, cidade, especialidades, preco_consulta_cents, atende_online, exemplo
         FROM accountants WHERE ${where.join(' AND ')} ORDER BY (uf = coalesce($${params.push(q.uf ?? '')}, '')) DESC, preco_consulta_cents LIMIT 50`,
      params,
    );
    return {
      contadores: rows.map((c) => ({
        id: c.id, nome: c.nome, crc: c.crc, uf: c.uf, cidade: c.cidade, especialidades: c.especialidades,
        precoConsultaCents: c.preco_consulta_cents, atendeOnline: c.atende_online, exemplo: c.exemplo,
      })),
    };
  });

  app.post('/contadores/:id/contato', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const b = contatoBody.parse(req.body);
    const existe = await pool.query('SELECT 1 FROM accountants WHERE id = $1 AND ativo', [id]);
    if (!existe.rowCount) throw notFound('Contador');
    const { rows } = await pool.query<{ id: string; created_at: Date }>(
      'INSERT INTO accountant_leads (user_id, accountant_id, assunto, mensagem) VALUES ($1,$2,$3,$4) RETURNING id, created_at',
      [req.user.sub, id, b.assunto, b.mensagem],
    );
    return reply.status(201).send({ contato: { id: rows[0]!.id, status: 'novo', criadoEm: rows[0]!.created_at } });
  });

  app.get('/contadores/contatos', async (req) => {
    const { rows } = await pool.query<{ id: string; nome: string; assunto: string; status: string; created_at: Date }>(
      `SELECT l.id, a.nome, l.assunto, l.status, l.created_at FROM accountant_leads l JOIN accountants a ON a.id = l.accountant_id
        WHERE l.user_id = $1 ORDER BY l.created_at DESC LIMIT 50`,
      [req.user.sub],
    );
    return { contatos: rows.map((r) => ({ id: r.id, contador: r.nome, assunto: r.assunto, status: r.status, criadoEm: r.created_at })) };
  });
}
