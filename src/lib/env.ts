import { z } from "zod";

/**
 * Server-side environment validation — the app fails AT BOOT on missing
 * config instead of at the first webhook. Import this (never process.env
 * directly) from any server code that needs configuration.
 *
 * Add every new variable here AND to .env.example in the same PR.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (see .env.example)"),
  /**
   * 32 bytes, base64 (44 chars). Field encryption for PayoutAccount /
   * AdminUser TOTP (ADR-010). Generate per environment — never reuse:
   * node -e "console.log(crypto.randomBytes(32).toString('base64'))"
   */
  DATA_ENCRYPTION_KEY: z
    .string()
    .min(44, "DATA_ENCRYPTION_KEY must be 32 bytes base64-encoded (44 chars)"),

  // --- Phase 1: auth — multi-provider login (ADR-007) ---
  // Google is the active provider; LINE is disabled (optional below);
  // Facebook/email+password are later providers (uncomment + register when each lands).
  /** Auth.js session/CSRF signing secret. `openssl rand -base64 32`. */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be ≥32 chars (openssl rand -base64 32)"),
  /**
   * Public origin Auth.js builds OAuth callback URLs from (e.g. `https://urest.app`).
   * REQUIRED in production: behind Railway's proxy the standalone server binds
   * `0.0.0.0:8080`, so without this Auth.js derives `redirect_uri=https://0.0.0.0:8080/...`
   * and Google rejects it. Optional in dev (localhost auto-detected). Auth.js reads
   * `AUTH_URL` from env directly; declared here for boot-validation + docs (rule 4).
   */
  AUTH_URL: z.string().url().optional(),
  /**
   * HMAC secret for the admin session token (ADR-007/010). Deliberately
   * SEPARATE from AUTH_SECRET so the admin surface shares no signing material
   * with the consumer auth path. `openssl rand -base64 32`.
   */
  ADMIN_SESSION_SECRET: z
    .string()
    .min(32, "ADMIN_SESSION_SECRET must be ≥32 chars (openssl rand -base64 32)"),
  /** Google OAuth 2.0 client (Google Cloud console) — the active login provider. */
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  /** LINE Login — DISABLED for now (ADR-007); optional so the app boots without it. */
  LINE_CLIENT_ID: z.string().min(1).optional(),
  LINE_CLIENT_SECRET: z.string().min(1).optional(),

  // --- Media storage: Cloudflare R2 (ADR-002/010, issue #11) ---
  /** R2 account id → endpoint https://{id}.r2.cloudflarestorage.com */
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  /** Public bucket — listing photos, CDN-served. */
  R2_PUBLIC_BUCKET: z.string().min(1),
  /** Private bucket — KYC docs; signed URLs only, never public (ADR-010). */
  R2_PRIVATE_BUCKET: z.string().min(1),
  /** CDN base URL for the public bucket (no trailing slash), e.g. https://media.urest.app */
  R2_PUBLIC_BASE_URL: z.string().url(),
  // FACEBOOK_CLIENT_ID: z.string().min(1),
  // FACEBOOK_CLIENT_SECRET: z.string().min(1),

  // --- Phase 2: listings ---
  /** Google Maps JS API key — HTTP referrer restricted; $0 billing cap (ADR-009). Optional: map fails closed without it. */
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),

  // --- Phase 3: payments — Opn (ADR-001, issue #20); TEST keys until launch gate ---
  /** Opn publishable key (`pkey_…`) — client-side card tokenization. */
  OPN_PUBLIC_KEY: z.string().startsWith("pkey_"),
  /** Opn secret key (`skey_…`) — server charge/source/retrieve + webhook re-fetch verification. */
  OPN_SECRET_KEY: z.string().startsWith("skey_"),
  /** Opn API base URL — leave default in real envs; E2E overrides it to the local mock (#29). */
  OPN_API_BASE: z.string().url().default("https://api.omise.co"),

  // --- Notifications: Resend email + LINE push (ADR-005) ---
  /** Resend API key for transactional email. Optional — console driver in dev/test. */
  RESEND_API_KEY: z.string().optional(),
  /** LINE Messaging API channel access token for push. Optional — console/skip without it. */
  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),

  // --- Phase 4: AI concierge ---
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  CONCIERGE_MODEL: z.string().default("claude-haiku-4-5"),
  /** ฿500/month default = 50,000 satang. Kill switch when monthly spend exceeds this. */
  CONCIERGE_BUDGET_SATANG: z.coerce.number().int().positive().default(50000),
  /** Per-user daily message cap; resets midnight ICT. */
  CONCIERGE_DAILY_MSG_LIMIT: z.coerce.number().int().positive().default(30),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment configuration:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment configuration — see errors above.");
}

export const env = parsed.data;
