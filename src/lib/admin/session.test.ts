import { describe, expect, it } from "vitest";

import { signAdminSession, verifyAdminSession } from "./session";

const NOW = 1_700_000_000_000;

describe("admin session token", () => {
  it("verifies a freshly signed token and returns the adminId", () => {
    const token = signAdminSession("admin1", { now: NOW });
    expect(verifyAdminSession(token, { now: NOW })).toEqual({ adminId: "admin1" });
  });

  it("rejects a token with a tampered payload", () => {
    const token = signAdminSession("admin1", { now: NOW });
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ adminId: "attacker", exp: NOW + 1e9 }))
      .toString("base64url");
    expect(verifyAdminSession(`${forged}.${sig}`, { now: NOW })).toBeNull();
  });

  it("rejects a token with a tampered signature", () => {
    const token = signAdminSession("admin1", { now: NOW });
    const [payload] = token.split(".");
    expect(verifyAdminSession(`${payload}.AAAA`, { now: NOW })).toBeNull();
  });

  it("rejects a malformed token (no signature segment) without throwing", () => {
    expect(verifyAdminSession("notavalidtoken", { now: NOW })).toBeNull();
    expect(verifyAdminSession("", { now: NOW })).toBeNull();
  });

  it("rejects an expired token (expiry is inside the signed payload)", () => {
    const token = signAdminSession("admin1", { now: NOW, ttlMs: 1000 });
    expect(verifyAdminSession(token, { now: NOW + 2000 })).toBeNull();
  });

  it("a wrong-length signature does not crash timingSafeEqual", () => {
    const token = signAdminSession("admin1", { now: NOW });
    const [payload] = token.split(".");
    expect(() => verifyAdminSession(`${payload}.ZZ`, { now: NOW })).not.toThrow();
    expect(verifyAdminSession(`${payload}.ZZ`, { now: NOW })).toBeNull();
  });
});
