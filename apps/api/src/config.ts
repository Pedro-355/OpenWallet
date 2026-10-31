import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRUST_PROXY: bool.default(true),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  REDIS_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  /** Caminho opcional para outra tabela de alíquotas (JSON). */
  TAX_RATES_FILE: z.string().optional(),
  RUN_MIGRATIONS_ON_START: bool.default(false),

  // Open Finance (provedor de dados). Sem OPENFINANCE_BASE_URL a integração fica desligada.
  OPENFINANCE_PROVIDER: z.string().default('sandbox'),
  OPENFINANCE_INSTITUTION: z.string().default('Banco Sandbox'),
  OPENFINANCE_BASE_URL: z.string().url().optional(),
  OPENFINANCE_API_KEY: z.string().default(''),
  OPENFINANCE_WEBHOOK_SECRET: z.string().default(''),
  /** Para onde o banco devolve o usuário depois do consentimento (tela web/app). */
  OPENFINANCE_REDIRECT_URL: z.string().url().default('http://localhost:5173/openfinance/callback'),
  /** Quantos dias para trás buscar ao conectar uma conta. */
  OPENFINANCE_BACKFILL_DAYS: z.coerce.number().int().positive().max(365).default(90),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(50).default(4),

  // ---- Modo "tudo em um" (deploy gratuito num serviço só) ----
  /** URL pública deste servidor. No Render vem de RENDER_EXTERNAL_URL. */
  PUBLIC_URL: z.string().url().optional(),
  /** Roda o worker dentro do processo da API (em vez de um processo separado). */
  RUN_WORKER: bool.default(false),
  /** Embute o Banco Sandbox em /sandbox-bank. */
  SANDBOX_BANK: bool.default(false),
  SANDBOX_SIMULATE_INTERVAL_MS: z.coerce.number().int().min(0).default(45_000),
  /** Pasta com o build da tela web para servir no mesmo endereço (ex.: apps/web/dist). */
  SERVE_WEB_DIR: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida:\n${msg}`);
  }
  const c = parsed.data;
  c.PUBLIC_URL ??= env.RENDER_EXTERNAL_URL || `http://localhost:${c.PORT}`;
  if (c.SANDBOX_BANK) {
    // O próprio servidor faz o papel do banco: a API fala com ele pela rede local.
    c.OPENFINANCE_PROVIDER = 'sandbox';
    c.OPENFINANCE_BASE_URL ??= `http://127.0.0.1:${c.PORT}/sandbox-bank`;
    if (!env.OPENFINANCE_REDIRECT_URL) c.OPENFINANCE_REDIRECT_URL = `${c.PUBLIC_URL}/openfinance/callback`;
    if (c.SERVE_WEB_DIR && !env.CORS_ORIGINS) c.CORS_ORIGINS = c.PUBLIC_URL;
    c.OPENFINANCE_API_KEY ||= randomBytes(24).toString('base64url');
    c.OPENFINANCE_WEBHOOK_SECRET ||= randomBytes(32).toString('base64url');
  }
  return c;
}
