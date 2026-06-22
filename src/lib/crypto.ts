import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

/**
 * Field-level encryption for sensitive columns (ADR-010).
 *
 * Scope: PayoutAccount.accountNumberEnc, User.totpSecretEnc (role=ADMIN rows) —
 * and nothing else without an ADR update. The most secure field is the one never
 * stored;
 * the second most secure is one of these.
 *
 * Format: `v1.<keyId>.<iv>.<ciphertext>.<tag>` (base64url segments).
 * Key rotation: add DATA_ENCRYPTION_KEY_V2, bump CURRENT_KEY_ID, re-encrypt
 * lazily on read — old ciphertexts name their key, so both decrypt.
 *
 * Never log plaintext OR ciphertext inputs/outputs of these functions.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // NIST-recommended for GCM
const CURRENT_KEY_ID = "k1";

function loadKey(keyId: string): Buffer {
  // Indirection point for rotation: k1 → DATA_ENCRYPTION_KEY, k2 → _V2, …
  //
  // Documented exception to CLAUDE.md rule 4 (env via lib/env.ts only):
  // the key is read lazily at call time so old key versions stay reachable
  // during rotation and tests can inject keys per-case. Boot-time presence
  // and length validation still happens in lib/env.ts.
  const raw =
    keyId === "k1" ? process.env.DATA_ENCRYPTION_KEY : undefined;
  if (!raw) {
    throw new Error(`Encryption key "${keyId}" is not configured`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `DATA_ENCRYPTION_KEY must be 32 bytes base64-encoded (got ${key.length} bytes). ` +
        `Generate one: node -e "console.log(crypto.randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
}

export function encryptField(plaintext: string): string {
  const key = loadKey(CURRENT_KEY_ID);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    CURRENT_KEY_ID,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptField(encrypted: string): string {
  const parts = encrypted.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") {
    throw new Error("Unrecognized encrypted-field format");
  }
  const [, keyId, ivB64, ciphertextB64, tagB64] = parts;
  if (!keyId || !ivB64 || !ciphertextB64 || !tagB64) {
    throw new Error("Malformed encrypted-field payload");
  }
  const key = loadKey(keyId);
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  // GCM authenticates: any tampering with iv/ciphertext/tag throws here.
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * One-way hash for OTP codes (PhoneOtp.codeHash) — codes are 6 digits, so a
 * per-row random salt prevents trivial rainbow lookup. Stored as `salt.hash`.
 */
export function hashOtp(code: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = createHash("sha256").update(`${salt}:${code}`).digest("base64url");
  return `${salt}.${hash}`;
}

export function verifyOtp(code: string, stored: string): boolean {
  const [salt, hash] = stored.split(".");
  if (!salt || !hash) return false;
  const candidate = createHash("sha256")
    .update(`${salt}:${code}`)
    .digest("base64url");
  return candidate === hash;
}
