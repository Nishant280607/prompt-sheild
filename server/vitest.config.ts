import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    // API tests share one SQLite file, so test files run one after another.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      JWT_SECRET: 'test-only-secret-with-enough-length-0123456789abcdef',
      BCRYPT_ROUNDS: '4',
      AI_PROVIDER: 'local',
      OPENAI_API_KEY: '',
      GEMINI_API_KEY: '',
      RATE_LIMIT_ENABLED: 'false',
    },
  },
});
