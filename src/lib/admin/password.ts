import { randomBytes } from "node:crypto";

import { argon2id, argon2Verify } from "hash-wasm";

/**
 * Admin password hashing (ADR-010): argon2id, one-way — never reversible, never
 * in the field-encrypted list. Uses the WASM argon2 (`hash-wasm`) rather than a
 * native binding so it traces cleanly into the Next standalone bundle on Railway
 * (no platform `.node` to miss).
 *
 * Params: 64 MiB / 3 iterations / parallelism 1 — OWASP-aligned for interactive
 * login. The encoded output string carries the salt + params, so verify needs
 * only (password, hash).
 */
const MEMORY_KIB = 64 * 1024;
const ITERATIONS = 3;
const PARALLELISM = 1;
const HASH_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: new Uint8Array(randomBytes(16)),
    memorySize: MEMORY_KIB,
    iterations: ITERATIONS,
    parallelism: PARALLELISM,
    hashLength: HASH_LENGTH,
    outputType: "encoded",
  });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    // Malformed stored hash → not a match (never throw out of an auth check).
    return false;
  }
}
