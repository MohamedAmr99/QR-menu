import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', include: ['packages/shared/src/**/*.test.ts'] } },
      {
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
          testTimeout: 20000,
          fileParallelism: false,
        },
      },
    ],
  },
});
