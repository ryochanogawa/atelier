import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**', 'src/ui/**'],
    },
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@application': path.resolve(__dirname, 'src/application'),
      '@adapters': path.resolve(__dirname, 'src/adapters'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@cli': path.resolve(__dirname, 'src/cli'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
