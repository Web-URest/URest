// Dummy env so modules that import `src/lib/env.ts` (zod-validated at boot)
// load during tests. Real secrets are never needed for unit tests — DB/auth
// access is mocked. crypto.test.ts sets its own DATA_ENCRYPTION_KEY per case.
// NODE_ENV is set to "test" by vitest already (and is read-only in the types).
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DATA_ENCRYPTION_KEY ??=
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-chars-long";
process.env.LINE_CLIENT_ID ??= "test-line-client-id";
process.env.LINE_CLIENT_SECRET ??= "test-line-client-secret";
