import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    globalSetup: ['tests/global-setup.ts'],
    // Test-only secret for encrypting stored keys (see src/server/crypto/secrets.ts).
    env: { BETTER_AUTH_SECRET: 'test-only-secret-not-used-anywhere-else' },
  },
});
