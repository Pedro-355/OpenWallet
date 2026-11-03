/**
 * Configuração única de testes do monorepo (Vitest "projects").
 *
 *  unit:*         rápidos, sem rede/banco/disco. Rodam em qualquer máquina e em todo commit.
 *  integration:*  usam Postgres e Redis reais (veja TESTING.md). Rodam no CI com serviços.
 *
 *   npm run test:unit          só unitários
 *   npm run test:integration   só integração
 *   npm run test:coverage      unitários + relatório de cobertura (falha abaixo do mínimo)
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Testes importam o código-fonte dos pacotes internos: não precisa compilar antes de testar.
const alias = {
  '@openwallet/tax/node': r('./packages/tax/src/node.ts'),
  '@openwallet/tax': r('./packages/tax/src/index.ts'),
  '@openwallet/openfinance-mock': r('./apps/openfinance-mock/src/app.ts'),
};

const unitDefaults = {
  // Testes unitários precisam ser determinísticos e isolados.
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { ...unitDefaults, name: 'unit:tax', root: r('./packages/tax'), include: ['src/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: { ...unitDefaults, name: 'unit:api', root: r('./apps/api'), include: ['src/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: { ...unitDefaults, name: 'unit:bank', root: r('./apps/openfinance-mock'), include: ['src/**/*.test.ts'] },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          ...unitDefaults,
          name: 'unit:web',
          root: r('./apps/web'),
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration:api',
          root: r('./apps/api'),
          include: ['test/integration/**/*.test.ts'],
          // Compartilham o mesmo banco de teste: em sequência para um não apagar dados do outro.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: r('./coverage'),
      // Mede o que tem lógica testável isoladamente. Rotas, worker e serviço com SQL
      // são cobertos pelos testes de integração.
      include: [
        'packages/tax/src/**/*.ts',
        'apps/api/src/config.ts',
        'apps/api/src/lib/**/*.ts',
        'apps/api/src/services/openfinance-rules.ts',
        'apps/api/src/services/assistente-rules.ts',
        'apps/openfinance-mock/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.*',
        '**/test/**',
        '**/server.ts',
        'apps/api/src/lib/worker.ts',
        'apps/api/src/lib/queue.ts',
        'apps/web/src/main.tsx',
        'apps/web/src/Impostometro.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
        // O cálculo do imposto é o coração do produto: exige mais.
        'packages/tax/src/**': { lines: 95, functions: 95, branches: 90, statements: 95 },
      },
    },
  },
});
