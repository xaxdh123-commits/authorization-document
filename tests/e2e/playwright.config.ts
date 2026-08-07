import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['workflow.e2e.spec.ts', 'lifecycle-history.e2e.spec.ts', 'api-attacks.e2e.spec.ts', 'create-case-timing.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: { baseURL: process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:4173', locale: 'zh-CN', trace: 'retain-on-failure' },
  reporter: [['list']],
});
