import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'worker',
    environment: 'node',
    include: ['worker/tests/**/*.spec.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
