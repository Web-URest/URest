import { describe, expect, it } from "vitest";

import { generateToken, generateTotpSecret, totpAuthUri, verifyTotp } from "./totp";

const SECRET = "JBSWY3DPEHPK3PXP"; // fixed base32 for determinism
const T = 1_700_000_000_000;

describe("admin TOTP", () => {
  it("verifies a token generated for the same time step", () => {
    expect(verifyTotp(SECRET, generateToken(SECRET, T), T)).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(verifyTotp(SECRET, "000000", T)).toBe(false);
  });

  it("accepts the previous time step (clock-skew window)", () => {
    const prev = generateToken(SECRET, T - 30_000);
    expect(verifyTotp(SECRET, prev, T)).toBe(true);
  });

  it("rejects a token from outside the window", () => {
    const far = generateToken(SECRET, T - 120_000);
    expect(verifyTotp(SECRET, far, T)).toBe(false);
  });

  it("generates a fresh base32 secret each time", () => {
    const a = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]+$/);
    expect(a).not.toBe(generateTotpSecret());
  });

  it("builds an otpauth:// enrollment URI carrying the secret", () => {
    const uri = totpAuthUri(SECRET, "admin@urest.local");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(`secret=${SECRET}`);
  });
});
