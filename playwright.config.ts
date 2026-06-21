import { defineConfig } from "@playwright/test";

/**
 * Money-path E2E (#29). Two web servers: the mock Opn gateway (:4100) and the Next
 * app (:3000, test env → urest_e2e DB + OPN_API_BASE→mock). Serialized (workers:1)
 * because specs share one test database.
 */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://urest:urest@localhost:5432/urest_e2e",
  OPN_API_BASE: "http://localhost:4100",
  OPN_PUBLIC_KEY: "pkey_test_e2e",
  OPN_SECRET_KEY: "skey_test_e2e",
  AUTH_SECRET: "e2e-dummy-secret-at-least-32-characters-long",
  ADMIN_SESSION_SECRET: "e2e-dummy-admin-secret-at-least-32-chars-x",
  DATA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  GOOGLE_CLIENT_ID: "e2e",
  GOOGLE_CLIENT_SECRET: "e2e",
  LINE_CLIENT_ID: "e2e",
  LINE_CLIENT_SECRET: "e2e",
  R2_ACCOUNT_ID: "e2e",
  R2_ACCESS_KEY_ID: "e2e",
  R2_SECRET_ACCESS_KEY: "e2e",
  R2_PUBLIC_BUCKET: "e2e-pub",
  R2_PRIVATE_BUCKET: "e2e-priv",
  R2_PUBLIC_BASE_URL: "https://cdn.e2e.example",
};

// Also apply to THIS process (workers + globalSetup) so the harness's `@/lib/db`
// → env.ts boot-validation passes and points at the test DB. `??=` keeps any real
// env (none set in CI) authoritative.
for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] ??= v;

export default defineConfig({
  testDir: "./e2e/specs",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "list" : "line",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: [
    {
      command: "pnpm tsx e2e/opn-mock.ts",
      port: 4100,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm dev",
      port: 3000,
      reuseExistingServer: !process.env.CI,
      env: TEST_ENV,
      timeout: 120_000,
    },
  ],
});
