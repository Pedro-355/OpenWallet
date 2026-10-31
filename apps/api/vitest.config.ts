import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Os arquivos compartilham o mesmo banco de teste: rodar em sequência evita TRUNCATE no meio de outro teste.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
