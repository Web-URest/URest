// Dummy env so modules that import `src/lib/env.ts` (zod-validated at boot)
// load during tests. Real secrets are never needed for unit tests — DB/auth
// access is mocked. crypto.test.ts sets its own DATA_ENCRYPTION_KEY per case.
// NODE_ENV is set to "test" by vitest already (and is read-only in the types).
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DATA_ENCRYPTION_KEY ??=
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-chars-long";
process.env.ADMIN_SESSION_SECRET ??= "test-admin-session-secret-32-chars-min";
process.env.LINE_CLIENT_ID ??= "test-line-client-id";
process.env.LINE_CLIENT_SECRET ??= "test-line-client-secret";
process.env.R2_ACCOUNT_ID ??= "test-account";
process.env.R2_ACCESS_KEY_ID ??= "test-access-key";
process.env.R2_SECRET_ACCESS_KEY ??= "test-secret-key";
process.env.R2_PUBLIC_BUCKET ??= "test-public";
process.env.R2_PRIVATE_BUCKET ??= "test-private";
process.env.R2_PUBLIC_BASE_URL ??= "https://cdn.test.example";
process.env.OPN_PUBLIC_KEY ??= "pkey_test_0000000000000000000";
process.env.OPN_SECRET_KEY ??= "skey_test_0000000000000000000";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-placeholder";
