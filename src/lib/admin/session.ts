import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Admin session token (ADR-007/010). A stateless, HMAC-signed token kept in a
 * cookie SEPARATE from the consumer Auth.js session — so a consumer session is
 * structurally useless on /admin.
 *
 * NOTE — deviation from ADR-010 #4 (which mandates revocable DB sessions for
 * consumers): the admin token is stateless. Immediate account-disable is still
 * guaranteed because `requireAdmin` re-reads the `AdminUser` row on every
 * request and rejects `disabledAt`; the signed expiry bounds a stolen token.
 * Per-device/single-session revocation is out of scope at pilot scale (would
 * need a session table — surfaced on the PR, not slipped in).
 *
 * Format: `base64url(JSON{adminId,exp})` + "." + `base64url(HMAC-SHA256(payload))`.
 * Expiry lives INSIDE the signed payload (the cookie maxAge is client-controlled
 * and not trusted).
 */

const DEFAULT_TTL_MS = 8 * 60 * 60_000; // 8h admin session

function sign(payloadB64: string): Buffer {
  return createHmac("sha256", env.ADMIN_SESSION_SECRET).update(payloadB64).digest();
}

export function signAdminSession(
  adminId: string,
  opts: { now?: number; ttlMs?: number } = {},
): string {
  const now = opts.now ?? Date.now();
  const exp = now + (opts.ttlMs ?? DEFAULT_TTL_MS);
  const payloadB64 = Buffer.from(JSON.stringify({ adminId, exp })).toString(
    "base64url",
  );
  return `${payloadB64}.${sign(payloadB64).toString("base64url")}`;
}

export function verifyAdminSession(
  token: string,
  opts: { now?: number } = {},
): { adminId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expected = sign(payloadB64);
  const got = Buffer.from(sigB64, "base64url");
  // Length guard FIRST — timingSafeEqual throws RangeError on length mismatch,
  // and an attacker controls the signature length. Treat any mismatch as invalid.
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return null;
  }

  let parsed: { adminId?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed.adminId !== "string" || typeof parsed.exp !== "number") {
    return null;
  }
  if (parsed.exp <= (opts.now ?? Date.now())) return null;

  return { adminId: parsed.adminId };
}
