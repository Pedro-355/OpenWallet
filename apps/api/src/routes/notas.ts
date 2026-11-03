import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ChaveInvalida, calculateTax, lerQrNfce } from '@openwallet/tax';
import { HttpError } from '../lib/errors.js';
import { hojeISO, positiveCents } from './crud.js';
import { dividirValor, type NotaFiscalProvider } from '../lib/gov-providers.js';

const lerBody = z.object({
  /** Texto do QR code (URL) ou a chave de 44 dígitos. */
  texto: z.string().trim().min(10).max(1000),
  /** Valor total, quando a pessoa informa (o QR code online não traz o valor). */
  valorCents: positiveCents.optional(),
  /** Força uma categoria para a nota inteira. */
  categoria: z.string().trim().min(1).max(40).optional(),
});

interface NotaRow {
  chave: string;
  uf: string;
  emitente_cnpj: string;
  emitente_nome: string;
  emitida_em: string;
  valor_cents: number;
  cpf_na_nota: boolean | null;
  itens: unknown;
  created_at: Date;
}
const toNota = (r: NotaRow) => ({
  chave: r.chave,
  uf: r.uf,
  emitenteCnpj: r.emitente_cnpj,
  emitenteNome: r.emitente_nome,
  emitidaEm: r.emitida_em,
  valorCents: r.valor_cents,
  cpfNaNota: r.cpf_na_nota,
  itens: r.itens,
  lidaEm: r.created_at,
});

export async function notasRoutes(app: FastifyInstance, opts: { provider: NotaFiscalProvider }) {
  const { pool, rates } = app.deps;
  app.addHook('onRequest', app.authenticate);

  /**
   * Lê o QR code de uma NFC-e: consulta a nota, separa os itens por categoria e cria um gasto
   * por categoria, já com o imposto. Ler a mesma nota de novo não duplica (409).
   */
  app.post('/notas/ler', async (req, reply) => {
    const userId = req.user.sub;
    const b = lerBody.parse(req.body);
    let leitura;
    try {
      leitura = lerQrNfce(b.texto);
    } catch (err) {
      if (err instanceof ChaveInvalida) throw new HttpError(400, 'nota_invalida', err.message);
      throw err;
    }

    const existente = await pool.query<NotaRow>('SELECT * FROM nfce_reads WHERE user_id = $1 AND chave = $2', [userId, leitura.chave]);
    if (existente.rows[0]) {
      return reply.status(409).send({ error: 'nota_ja_lida', message: 'Você já registrou esta nota.', nota: toNota(existente.rows[0]) });
    }

    const consulta = await opts.provider.consultar({ ...leitura, valorCents: b.valorCents ?? leitura.valorCents });
    const total = b.valorCents ?? consulta.valorCents;
    // Se a pessoa informou outro total, os itens são reescalados para bater com ele.
    const valores = dividirValor(total, consulta.itens.map((i) => Math.max(1, i.valorCents)));
    const itens = consulta.itens.map((i, idx) => ({ ...i, valorCents: valores[idx]!, categoria: b.categoria ?? i.categoria }));
    const porCategoria = new Map<string, number>();
    for (const i of itens) porCategoria.set(i.categoria, (porCategoria.get(i.categoria) ?? 0) + i.valorCents);
    const hoje = hojeISO();
    const data = consulta.emitidaEm > hoje ? hoje : consulta.emitidaEm;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const nota = await client.query<NotaRow>(
        `INSERT INTO nfce_reads (user_id, chave, uf, emitente_cnpj, emitente_nome, emitida_em, valor_cents, cpf_na_nota, itens)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING RETURNING *`,
        [userId, leitura.chave, leitura.uf, leitura.cnpjEmitente, consulta.emitenteNome, data, total, consulta.cpfNaNota, JSON.stringify(itens)],
      );
      if (!nota.rows[0]) {
        await client.query('ROLLBACK');
        throw new HttpError(409, 'nota_ja_lida', 'Você já registrou esta nota.');
      }
      const gastos = [];
      for (const [categoria, valor] of porCategoria) {
        const tax = calculateTax(rates, { amountCents: valor, category: categoria, uf: leitura.uf });
        const { rows } = await client.query<{ id: string; category: string; amount_cents: number; tax_total_cents: number }>(
          `INSERT INTO expenses (user_id, amount_cents, category, description, uf, spent_on,
             tax_federal_cents, tax_estadual_cents, tax_municipal_cents, tax_total_cents, tax_rate_pct, rates_version,
             source, external_id, cpf_na_nota)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'nfce',$13,$14)
           RETURNING id, category, amount_cents, tax_total_cents`,
          [userId, valor, tax.category, consulta.emitenteNome.slice(0, 200), leitura.uf, data, tax.federalCents, tax.estadualCents,
            tax.municipalCents, tax.totalCents, tax.ratePct, tax.ratesVersion, `nfce:${leitura.chave}:${tax.category}`, consulta.cpfNaNota],
        );
        gastos.push({ id: rows[0]!.id, categoria: rows[0]!.category, valorCents: rows[0]!.amount_cents, impostoCents: rows[0]!.tax_total_cents });
      }
      await client.query('COMMIT');
      await app.cache.bumpUser(userId);
      return reply.status(201).send({ nota: toNota(nota.rows[0]), gastos });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  app.get('/notas', async (req) => {
    const { rows } = await pool.query<NotaRow>(
      'SELECT * FROM nfce_reads WHERE user_id = $1 ORDER BY emitida_em DESC, created_at DESC LIMIT 100',
      [req.user.sub],
    );
    const semCpf = rows.filter((r) => r.cpf_na_nota === false).length;
    return { notas: rows.map(toNota), resumo: { total: rows.length, semCpf } };
  });
}
