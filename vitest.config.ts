import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // React + JSX transform for .tsx component tests. The plugin is only
  // active in vitest runs (no Next build dependency).
  plugins: [react()],
  test: {
    globals: true,
    // .tsx component tests need a DOM ; pick happy-dom (faster than jsdom)
    // via the `@vitest-environment` directive in the test file itself.
    // Node-only tests keep the default 'node' env.
    environment: 'node',
    // Les tests E2E Playwright vivent dans /e2e et ne doivent pas être ramassés par vitest.
    exclude: ['node_modules', 'dist', '.next', 'e2e/**', '.claude/**'],
    // Forks au lieu de threads : `vi.mock('@/lib/prisma', ...)` partagé entre
    // plusieurs fichiers de test fuyait son état en mode threads. Forks =
    // process séparé par fichier → isolation stricte des modules mockés.
    pool: 'forks',
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
