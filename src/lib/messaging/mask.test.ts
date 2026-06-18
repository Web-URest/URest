import { describe, expect, it } from "vitest";

import { maskBody } from "./mask";

const MARK = "[ปกปิด]";

describe("maskBody — Thai phone numbers", () => {
  it.each([
    "0812345678",
    "081-234-5678",
    "08 1234 5678",
    "+66812345678",
    "โทรมาที่ 099 111 2222 นะคะ",
  ])("redacts %s", (input) => {
    const { masked, wasMasked } = maskBody(input);
    expect(wasMasked).toBe(true);
    expect(masked).toContain(MARK);
    expect(masked).not.toMatch(/\d{4}/); // no 4+ contiguous digits survive
  });
});

describe("maskBody — bank-account-length digit runs", () => {
  it("redacts a 10-digit account number", () => {
    expect(maskBody("โอนมาที่ 1234567890").masked).toContain(MARK);
  });
  it("redacts a dashed account number", () => {
    expect(maskBody("บัญชี 012-3-45678-9 ครับ").masked).toContain(MARK);
  });
});

describe("maskBody — LINE IDs", () => {
  it.each(["@john_doe", "line id: john.doe", "ไลน์ abc123", "ไอดีไลน์ x_y_z", "add line: scammer1"])(
    "redacts %s",
    (input) => {
      expect(maskBody(input).wasMasked).toBe(true);
    },
  );
});

describe("maskBody — URLs", () => {
  it.each(["http://evil.example", "https://scam.co/pay", "www.pay-here.com", "go to example.com/x"])(
    "redacts %s",
    (input) => {
      expect(maskBody(input).masked).toContain(MARK);
    },
  );
});

describe("maskBody — negatives (must NOT redact)", () => {
  it("leaves small numbers alone (guests / nights)", () => {
    const { masked, wasMasked } = maskBody("มากัน 8 คน พัก 3 คืน");
    expect(wasMasked).toBe(false);
    expect(masked).toBe("มากัน 8 คน พัก 3 คืน");
  });
  it("leaves a check-in time alone", () => {
    expect(maskBody("เช็คอิน 14:00 ได้ไหมคะ").wasMasked).toBe(false);
  });
  it("leaves an 8-digit date alone", () => {
    expect(maskBody("วันที่ 2026-08-03").wasMasked).toBe(false);
  });
  it("leaves a clean message alone", () => {
    const clean = "สวัสดีค่ะ บ้านสวยมาก อยากทราบว่ามีที่จอดรถไหมคะ";
    expect(maskBody(clean)).toEqual({ masked: clean, wasMasked: false });
  });
  it("does not trip on the word 'online'", () => {
    expect(maskBody("จองออนไลน์ online ได้เลย").wasMasked).toBe(false);
  });
});
