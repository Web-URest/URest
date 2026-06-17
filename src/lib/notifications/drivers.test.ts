import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consoleEmailDriver,
  lineMessagingDriver,
  resendEmailDriver,
  selectEmailDriver,
  selectLineDriver,
} from "./drivers";

type Init = { method: string; headers: Record<string, string>; body: string };
function stubFetch(status: number) {
  const m = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, text: async () => "" });
  vi.stubGlobal("fetch", m);
  return m;
}
afterEach(() => vi.unstubAllGlobals());

describe("selectEmailDriver", () => {
  it("uses Resend when a key is present", () => {
    expect(selectEmailDriver("production", "re_x")).toBe(resendEmailDriver);
  });
  it("falls back to console in dev/test without a key", () => {
    expect(selectEmailDriver("test", undefined)).toBe(consoleEmailDriver);
  });
  it("throws in production without a key (email = channel of record)", () => {
    expect(() => selectEmailDriver("production", undefined)).toThrow(/channel of record|RESEND/i);
  });
});

describe("selectLineDriver", () => {
  it("uses the LINE driver when a token is present", () => {
    expect(selectLineDriver("production", "tok")).toBe(lineMessagingDriver);
  });
  it("skips (null) in production without a token", () => {
    expect(selectLineDriver("production", undefined)).toBeNull();
  });
  it("falls back to console in dev/test", () => {
    expect(selectLineDriver("development", undefined)).not.toBeNull();
  });
});

describe("resendEmailDriver", () => {
  it("POSTs to Resend as plain text (never html) with bearer auth", async () => {
    const m = stubFetch(200);
    await resendEmailDriver.send("g@x.com", "subj", "body <with> markup");
    const [url, init] = m.mock.calls[0] as unknown as [string, Init];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toMatch(/^Bearer /);
    const sent = JSON.parse(init.body) as { to?: string; text?: string; html?: string };
    expect(sent.to).toBe("g@x.com");
    // Sent as `text`, not `html` — interpolated user/host values can't inject markup.
    expect(sent.text).toBe("body <with> markup");
    expect(sent.html).toBeUndefined();
  });
  it("throws on a non-2xx response", async () => {
    stubFetch(500);
    await expect(resendEmailDriver.send("g@x.com", "s", "b")).rejects.toThrow(/Resend 500/);
  });
});

describe("lineMessagingDriver", () => {
  it("POSTs a text push to the LINE Messaging API", async () => {
    const m = stubFetch(200);
    await lineMessagingDriver.push("U123", "hello");
    const [url, init] = m.mock.calls[0] as unknown as [string, Init];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(init.body).toContain("U123");
    expect(init.body).toContain("hello");
  });
});
