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
