/**
 * Vite + Vitest configuration.
 * Tests live in /tests and run in a plain Node environment,
 * because the engine has no DOM code.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
