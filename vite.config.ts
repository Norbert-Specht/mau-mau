/**
 * Vite + Vitest configuration.
 * Two pages are built: the game (index.html) and the design gallery
 * (design/index.html → /design/). Tests live in /tests and run in a plain
 * Node environment, because the engine has no DOM code.
 */
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        design: resolve(__dirname, 'design/index.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
