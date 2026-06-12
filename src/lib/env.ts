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

  // --- Phase 1: auth (uncomment when LINE Login lands) ---
  // AUTH_SECRET: z.string().min(32),
  // LINE_CLIENT_ID: z.string().min(1),
  // LINE_CLIENT_SECRET: z.string().min(1),

  // --- Phase 3: payments ---
  // OPN_PUBLIC_KEY: z.string().startsWith("pkey_"),
  // OPN_SECRET_KEY: z.string().startsWith("skey_"),

  // --- Phase 4: AI concierge ---
  // ANTHROPIC_API_KEY: z.string().min(1),
  // CONCIERGE_MODEL: z.string().default("claude-haiku-4-5"),
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
