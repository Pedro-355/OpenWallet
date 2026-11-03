import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { UFS, calculateTax } from '@openwallet/tax';

const estimateQuery = z.object({
  amountCents: z.coerce.number().int().positive().max(100_000_000_000),
  category: z.string().min(1).max(40),
  uf: z.enum(UFS),
});

export async function taxRoutes(app: FastifyInstance) {
  const { rates } = app.deps;
  const body = JSON.stringify(rates);
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;

  /** Tabela completa (pública). Os apps guardam em cache e só baixam de novo se o ETag mudar. */
  app.get('/tax/rates', async (req, reply) => {
    reply.header('etag', etag).header('cache-control', 'public, max-age=3600');
    if (req.headers['if-none-match'] === etag) return reply.status(304).send();
    return reply.type('application/json').send(body);
  });

  /** Lista enxuta de categorias para montar formulários. */
  app.get('/tax/categories', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=3600');
    return {
      ratesVersion: rates.version,
      illustrative: rates.illustrative,
      categories: Object.entries(rates.categories).map(([key, c]) => ({ key, label: c.label })),
    };
  });

  /** Simulação sem salvar: "quanto de imposto tem nesse valor?" */
  app.get('/tax/estimate', async (req) => {
    const q = estimateQuery.parse(req.query);
    return { tax: calculateTax(rates, q) };
  });
}
