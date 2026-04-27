import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Les tests E2E Playwright vivent dans /e2e et ne doivent pas être ramassés par vitest.
    exclude: ['node_modules', 'dist', '.next', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
