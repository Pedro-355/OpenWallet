import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const monthQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'use o formato AAAA-MM')
    .optional(),
});
const historyQuery = z.object({ months: z.coerce.number().int().min(1).max(36).default(12) });

const CACHE_TTL = 600; // 10 min; a invalidação real acontece pela versão do usuário

function currentMonth(): string {
  // Mês corrente no horário de Brasília.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10_000) / 100 : 0);

export async function impostometroRoutes(app: FastifyInstance) {
  const { pool, rates } = app.deps;
  app.addHook('onRequest', app.authenticate);

  /** Resumo do mês: quanto foi gasto, quanto disso foi imposto, por esfera e por categoria. */
  app.get('/impostometro/summary', async (req, reply) => {
    const userId = req.user.sub;
    const month = monthQuery.parse(req.query).month ?? currentMonth();
    const cacheKey = `sum:${userId}:${month}:${await app.cache.userVersion(userId)}`;
    const cached = await app.cache.getJSON(cacheKey);
    if (cached) return reply.header('x-cache', 'hit').send(cached);

    const start = `${month}-01`;
    const [byCat, ytd] = await Promise.all([
      pool.query<{
        category: string; count: number; spent: number; tax: number; fed: number; est: number; mun: number;
      }>(
        `SELECT category, count(*)::int AS count,
                sum(amount_cents)::bigint AS spent, sum(tax_total_cents)::bigint AS tax,
                sum(tax_federal_cents)::bigint AS fed, sum(tax_estadual_cents)::bigint AS est,
                sum(tax_municipal_cents)::bigint AS mun
           FROM expenses
          WHERE user_id = $1 AND spent_on >= $2::date AND spent_on < ($2::date + interval '1 month')
          GROUP BY category ORDER BY tax DESC`,
        [userId, start],
      ),
      pool.query<{ tax: number | null; spent: number | null }>(
        `SELECT sum(tax_total_cents)::bigint AS tax, sum(amount_cents)::bigint AS spent FROM expenses
          WHERE user_id = $1 AND spent_on >= date_trunc('year', $2::date)
            AND spent_on < ($2::date + interval '1 month')`,
        [userId, start],
      ),
    ]);

    const t = byCat.rows.reduce(
      (a, r) => ({ spent: a.spent + r.spent, tax: a.tax + r.tax, fed: a.fed + r.fed, est: a.est + r.est, mun: a.mun + r.mun, count: a.count + r.count }),
      { spent: 0, tax: 0, fed: 0, est: 0, mun: 0, count: 0 },
    );

    const body = {
      month,
      ratesVersion: rates.version,
      illustrative: rates.illustrative,
      totals: {
        count: t.count,
        spentCents: t.spent,
        taxCents: t.tax,
        federalCents: t.fed,
        estadualCents: t.est,
        municipalCents: t.mun,
        effectivePct: pct(t.tax, t.spent),
      },
      yearToDate: { taxCents: ytd.rows[0]?.tax ?? 0, spentCents: ytd.rows[0]?.spent ?? 0 },
      byCategory: byCat.rows.map((r) => ({
        category: r.category,
        label: rates.categories[r.category]?.label ?? r.category,
        count: r.count,
        spentCents: r.spent,
        taxCents: r.tax,
        effectivePct: pct(r.tax, r.spent),
      })),
    };
    await app.cache.setJSON(cacheKey, body, CACHE_TTL);
    return reply.header('x-cache', 'miss').send(body);
  });

  /** Imposto pago mês a mês, para o gráfico de evolução. */
  app.get('/impostometro/history', async (req) => {
    const userId = req.user.sub;
    const { months } = historyQuery.parse(req.query);
    const cacheKey = `hist:${userId}:${months}:${currentMonth()}:${await app.cache.userVersion(userId)}`;
    const cached = await app.cache.getJSON(cacheKey);
    if (cached) return cached;

    const { rows } = await pool.query<{ month: string; spent: number; tax: number }>(
      `WITH m AS (
         SELECT generate_series(
           date_trunc('month', $2::date) - make_interval(months => $3 - 1),
           date_trunc('month', $2::date), interval '1 month')::date AS month)
       SELECT to_char(m.month, 'YYYY-MM') AS month,
              coalesce(sum(e.amount_cents), 0)::bigint AS spent,
              coalesce(sum(e.tax_total_cents), 0)::bigint AS tax
         FROM m LEFT JOIN expenses e
           ON e.user_id = $1 AND e.spent_on >= m.month AND e.spent_on < m.month + interval '1 month'
        GROUP BY m.month ORDER BY m.month`,
      [userId, `${currentMonth()}-01`, months],
    );
    const body = { months: rows.map((r) => ({ month: r.month, spentCents: r.spent, taxCents: r.tax })) };
    await app.cache.setJSON(cacheKey, body, CACHE_TTL);
    return body;
  });
}
