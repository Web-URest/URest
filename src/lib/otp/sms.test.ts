import { describe, expect, it, vi } from "vitest";

import { consoleSmsDriver, selectSmsDriver } from "./sms";

describe("selectSmsDriver", () => {
  it("returns the console driver in development", () => {
    expect(selectSmsDriver("development")).toBe(consoleSmsDriver);
  });

  it("returns the console driver in test", () => {
    expect(selectSmsDriver("test")).toBe(consoleSmsDriver);
  });

  it("throws in production — no real SMS provider is configured yet (fails closed)", () => {
    // The console driver prints the code; using it in prod would leak OTP codes
    // into logs (ADR-010 §7). Until the provider-config PR lands, prod has no
    // driver and OTP must be unavailable rather than insecure.
    expect(() => selectSmsDriver("production")).toThrow(/provider/i);
  });
});

describe("consoleSmsDriver", () => {
  it("delivers by logging the message (dev only)", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await consoleSmsDriver.send("0812345678", "your code is 123456");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.join(" ")).toContain("0812345678");
    spy.mockRestore();
  });
});
