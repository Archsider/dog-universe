import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Les tests E2E Playwright vivent dans /e2e et ne doivent pas être ramassés par vitest.
    exclude: ['node_modules', 'dist', '.next', 'e2e/**', '.claude/**'],
    // Forks au lieu de threads : `vi.mock('@/lib/prisma', ...)` partagé entre
    // plusieurs fichiers de test fuyait son état en mode threads. Forks =
    // process séparé par fichier → isolation stricte des modules mockés.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
