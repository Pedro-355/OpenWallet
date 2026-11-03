import { buildMockApp } from './app.js';

const port = Number(process.env.PORT ?? 4000);
const app = await buildMockApp({
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
  apiKey: process.env.SANDBOX_API_KEY ?? 'sandbox-key',
  webhookUrl: process.env.WEBHOOK_URL ?? 'http://localhost:3000/v1/webhooks/openfinance',
  webhookSecret: process.env.WEBHOOK_SECRET ?? 'sandbox-webhook-secret',
  simulateIntervalMs: Number(process.env.SIMULATE_INTERVAL_MS ?? 30_000),
  backfillDays: Number(process.env.BACKFILL_DAYS ?? 30),
  logger: true,
});
await app.listen({ host: '0.0.0.0', port });

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => void app.close().then(() => process.exit(0)));
}
