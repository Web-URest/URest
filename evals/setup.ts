// Eval env (#33). Points env.ts at the eval DB and supplies dummy non-secret
// values, EXACTLY like vitest.setup.ts — except ANTHROPIC_API_KEY, which is left
// to the real environment (the eval needs a live key; the runner errors clearly
// if it's absent). `??=` keeps any real env authoritative.
process.env.DATABASE_URL ??= "postgresql://urest:urest@localhost:5432/urest_eval";
process.env.DATA_ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
process.env.AUTH_SECRET ??= "eval-auth-secret-at-least-32-chars-long-xx";
process.env.ADMIN_SESSION_SECRET ??= "eval-admin-session-secret-32-chars-min-x";
process.env.LINE_CLIENT_ID ??= "eval-line-client-id";
process.env.LINE_CLIENT_SECRET ??= "eval-line-client-secret";
process.env.R2_ACCOUNT_ID ??= "eval-account";
process.env.R2_ACCESS_KEY_ID ??= "eval-access-key";
process.env.R2_SECRET_ACCESS_KEY ??= "eval-secret-key";
process.env.R2_PUBLIC_BUCKET ??= "eval-public";
process.env.R2_PRIVATE_BUCKET ??= "eval-private";
process.env.R2_PUBLIC_BASE_URL ??= "https://cdn.eval.example";
process.env.OPN_PUBLIC_KEY ??= "pkey_test_0000000000000000000";
process.env.OPN_SECRET_KEY ??= "skey_test_0000000000000000000";
// NOTE: ANTHROPIC_API_KEY intentionally NOT defaulted — the eval requires a real key.
