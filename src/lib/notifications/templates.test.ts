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

describe("payment lifecycle templates", () => {
  it("PAYMENT_RECEIVED_GUEST is priority and carries the booking code", () => {
    const t = getTemplate("PAYMENT_RECEIVED_GUEST");
    expect(t?.priority).toBe(true);
    expect(t?.email({ listingTitle: "วิลล่า A", code: "UR-2606-0001" }).subject).toContain("UR-2606-0001");
    expect(t?.line({ listingTitle: "วิลล่า A", code: "UR-2606-0001" })).toContain("UR-2606-0001");
  });
  it("PAYMENT_RECEIVED_HOST is priority and names the listing", () => {
    const t = getTemplate("PAYMENT_RECEIVED_HOST");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A", code: "UR-2606-0001" })).toContain("วิลล่า A");
  });
  it("PAYMENT_EXPIRED_HOST tells the host dates were released", () => {
    const t = getTemplate("PAYMENT_EXPIRED_HOST");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
  });
  it("PAYMENT_REMINDER_GUEST nudges the guest to pay", () => {
    const t = getTemplate("PAYMENT_REMINDER_GUEST");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
  });
  it("PAYMENT_REFUNDED_GUEST tells the guest they were refunded in full", () => {
    const t = getTemplate("PAYMENT_REFUNDED_GUEST");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
    expect(t?.email({ listingTitle: "วิลล่า A" }).subject).toBeTruthy();
  });
});

describe("listing approval templates (#14)", () => {
  it("LISTING_APPROVED is priority and names the listing", () => {
    const t = getTemplate("LISTING_APPROVED");
    expect(t?.priority).toBe(true);
    expect(t?.email({ listingTitle: "วิลล่า A" }).subject).toContain("วิลล่า A");
    expect(t?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
  });

  it("LISTING_NEEDS_INFO body renders the itemized checklist labels + notes", () => {
    const t = getTemplate("LISTING_NEEDS_INFO");
    expect(t?.priority).toBe(true);
    const body = t?.email({
      listingTitle: "วิลล่า A",
      items: [
        { item: "THAI_ID_UNCLEAR", satisfied: false },
        { item: "BANK_NAME_MISMATCH", note: "ชื่อไม่ตรง", satisfied: false },
      ],
    }).body;
    expect(body).toContain("บัตรประชาชนไม่ชัด");
    expect(body).toContain("ชื่อบัญชีธนาคารไม่ตรงกับบัตร");
    expect(body).toContain("ชื่อไม่ตรง"); // per-item note
  });

  it("LISTING_REJECTED carries the rejection reason", () => {
    const t = getTemplate("LISTING_REJECTED");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A", reason: "ภาพปลอม" })).toContain("ภาพปลอม");
    expect(t?.email({ listingTitle: "วิลล่า A", reason: "ภาพปลอม" }).body).toContain("ภาพปลอม");
  });
});

describe("report templates (#27)", () => {
  it("REPORT_RECEIVED acks with the Thai category label", () => {
    const t = getTemplate("REPORT_RECEIVED");
    expect(t?.priority).toBe(true);
    expect(t?.email({ category: "SAFETY", targetLabel: "วิลล่า A" }).subject).toContain("ความปลอดภัย");
    expect(t?.line({ category: "SAFETY", targetLabel: "วิลล่า A" })).toContain("ความปลอดภัย");
  });
  it("REPORT_RESOLVED carries the decision reason", () => {
    const t = getTemplate("REPORT_RESOLVED");
    expect(t?.email({ category: "CLEANLINESS", reason: "คืนเงินแล้ว" }).body).toContain("คืนเงินแล้ว");
  });
  it("REPORT_DISMISSED resolves to a template", () => {
    expect(getTemplate("REPORT_DISMISSED")?.line({ category: "OTHER", reason: "นอกประเด็น" })).toContain("นอกประเด็น");
  });
});

describe("cancellation templates", () => {
  it("BOOKING_CANCELLED_BY_GUEST notifies the host which listing was cancelled", () => {
    const t = getTemplate("BOOKING_CANCELLED_BY_GUEST");
    expect(t).toBeDefined();
    expect(t?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
  });
  it("BOOKING_CANCELLED_BY_HOST is priority and shows the guest the refund amount", () => {
    const t = getTemplate("BOOKING_CANCELLED_BY_HOST");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A", refundSatang: 12_900_00 })).toContain("วิลล่า A");
    // refund amount formatted at the display edge (฿12,900)
    expect(t?.email({ listingTitle: "วิลล่า A", refundSatang: 12_900_00 }).body).toContain("12,900");
  });
});
