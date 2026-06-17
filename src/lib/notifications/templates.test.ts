import { describe, expect, it } from "vitest";

import { getTemplate } from "./templates";

describe("getTemplate", () => {
  it("renders the BOOKING_REQUESTED email + LINE text (priority) from a payload", () => {
    const t = getTemplate("BOOKING_REQUESTED");
    expect(t).toBeDefined();
    expect(t?.priority).toBe(true);
    const payload = { listingTitle: "บ้านพูลวิลล่า จอมเทียน", guestName: "สมชาย" };
    expect(t?.email(payload).subject).toContain("บ้านพูลวิลล่า จอมเทียน");
    expect(t?.email(payload).body).toContain("สมชาย");
    expect(t?.line(payload)).toContain("บ้านพูลวิลล่า จอมเทียน");
  });

  it("returns undefined for an unknown key", () => {
    expect(getTemplate("NOPE")).toBeUndefined();
  });
});

describe("request lifecycle templates", () => {
  it("renders REQUEST_ACCEPTED (priority) — guest gets a pay prompt", () => {
    const t = getTemplate("REQUEST_ACCEPTED");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
    expect(t?.email({ listingTitle: "วิลล่า A" }).subject).toContain("ยืนยัน");
  });
  it("renders REQUEST_DECLINED + REQUEST_EXPIRED", () => {
    expect(getTemplate("REQUEST_DECLINED")?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
    expect(getTemplate("REQUEST_EXPIRED")?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
  });
});
