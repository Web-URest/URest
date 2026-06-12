import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { randomBytes } from "node:crypto";
import { decryptField, encryptField, hashOtp, verifyOtp } from "./crypto";

const TEST_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.DATA_ENCRYPTION_KEY;
});

describe("field encryption (AES-256-GCM, ADR-010)", () => {
  // Property: any unicode string survives the round trip — bank account
  // numbers, Thai text, emoji, whatever ends up in an Enc column.
  it("round-trips arbitrary unicode strings", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), (plain) => {
        expect(decryptField(encryptField(plain))).toBe(plain);
      }),
    );
  });

  it("produces distinct ciphertexts for identical plaintexts (fresh IV per call)", () => {
    const a = encryptField("1234567890");
    const b = encryptField("1234567890");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  // Property: GCM authentication — flipping any BIT of iv/ciphertext/tag must
  // throw, never return wrong plaintext silently. Tampering happens at the
  // byte level: flipping base64url *characters* can be a no-op (trailing bits
  // beyond the encoded byte length are ignored by the decoder) — fast-check
  // caught exactly that flaw in the first version of this test.
  it("detects tampering anywhere in the payload", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (seed) => {
        const encrypted = encryptField("110-2-34567-8");
        const segments = encrypted.split(".");
        const target = 2 + (seed % 3); // iv | ciphertext | tag
        const bytes = Buffer.from(segments[target]!, "base64url");
        const byteIdx = (seed >> 3) % bytes.length;
        const original = bytes[byteIdx];
        if (original === undefined) throw new Error("unreachable");
        bytes[byteIdx] = original ^ (1 << seed % 8); // flip one real bit
        segments[target] = bytes.toString("base64url");
        expect(() => decryptField(segments.join("."))).toThrow();
      }),
    );
  });

  it("rejects decryption with a different key", () => {
    const encrypted = encryptField("secret-bank-account");
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptField(encrypted)).toThrow();
  });

  it("rejects malformed or wrong-format payloads", () => {
    expect(() => decryptField("not-encrypted")).toThrow(/format/);
    expect(() => decryptField("v2.k1.a.b.c")).toThrow(/format/);
    expect(() => decryptField("v1.k1..b.c")).toThrow();
  });

  it("fails loudly on a bad key (wrong length)", () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptField("x")).toThrow(/32 bytes/);
  });

  it("fails loudly when the key is missing", () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => encryptField("x")).toThrow(/not configured/);
  });
});

describe("OTP hashing", () => {
  it("verifies the correct code and rejects others", () => {
    const stored = hashOtp("482913");
    expect(verifyOtp("482913", stored)).toBe(true);
    expect(verifyOtp("482914", stored)).toBe(false);
    expect(verifyOtp("", stored)).toBe(false);
  });

  it("never stores the code itself and salts every row", () => {
    const stored = hashOtp("123456");
    expect(stored).not.toContain("123456");
    expect(hashOtp("123456")).not.toBe(stored); // fresh salt per row
  });
});
