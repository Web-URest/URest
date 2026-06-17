import { describe, expect, it } from "vitest";

import { confirmRedirectHref, qrUrlFromCharge } from "./helpers";

describe("confirmRedirectHref", () => {
  it("returns the trip href once CONFIRMED", () => {
    expect(confirmRedirectHref("CONFIRMED", "bk1")).toBe("/trips/bk1");
  });
  it("returns null while still awaiting payment", () => {
    expect(confirmRedirectHref("AWAITING_PAYMENT", "bk1")).toBeNull();
  });
  it("also redirects on a terminal non-payable status (expired/cancelled) so the poller leaves the pay screen", () => {
    expect(confirmRedirectHref("EXPIRED", "bk1")).toBe("/trips/bk1");
  });
});

describe("qrUrlFromCharge", () => {
  it("pulls the PromptPay QR download uri", () => {
    expect(qrUrlFromCharge({ source: { scannable_code: { image: { download_uri: "https://x/qr.png" } } } })).toBe("https://x/qr.png");
  });
  it("is undefined when the charge has no QR", () => {
    expect(qrUrlFromCharge({ source: null })).toBeUndefined();
    expect(qrUrlFromCharge({})).toBeUndefined();
  });
});
