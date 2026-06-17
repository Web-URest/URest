import { describe, expect, it } from "vitest";

import { maskedContact } from "./contact";

describe("maskedContact", () => {
  it("hides contact until contactUnmaskedAt is set", () => {
    expect(maskedContact(null, { email: "g@x.com", phone: "0812345678" })).toEqual({
      email: null,
      phone: null,
    });
  });
  it("reveals contact once unmasked (CONFIRMED)", () => {
    const c = { email: "g@x.com", phone: "0812345678" };
    expect(maskedContact(new Date(), c)).toEqual(c);
  });
});
