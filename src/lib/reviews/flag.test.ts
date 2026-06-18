import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { report: { create: vi.fn(), update: vi.fn() } } }));

import { prisma } from "@/lib/db";

import { flagReview, resolveReviewFlag } from "./flag";

const db = prisma as unknown as { report: { create: Mock; update: Mock } };
const NOW = new Date("2026-06-20T00:00:00Z");

afterEach(() => vi.clearAllMocks());

describe("flagReview", () => {
  it("creates a reviewId-scoped Report (RECEIVED) with the reporter + reason", async () => {
    await flagReview("u1", "rv1", "เปิดเผยข้อมูลส่วนตัว");
    expect(db.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reporterId: "u1",
        reviewId: "rv1",
        category: "OTHER",
        status: "RECEIVED",
        text: "เปิดเผยข้อมูลส่วนตัว",
      }),
    });
  });

  it("allows an anonymous report and defaults an empty reason", async () => {
    await flagReview(null, "rv1", "  ");
    const data = db.report.create.mock.calls[0]?.[0]?.data;
    expect(data.reporterId).toBeNull();
    expect(data.text).toBeTruthy();
  });
});

describe("resolveReviewFlag", () => {
  it("RESOLVED marks the report resolved + records the admin", async () => {
    await resolveReviewFlag("rp1", "RESOLVED", "adm1", NOW);
    expect(db.report.update).toHaveBeenCalledWith({
      where: { id: "rp1" },
      data: expect.objectContaining({ status: "RESOLVED", triageByAdminId: "adm1", resolvedAt: NOW }),
    });
  });

  it("DISMISSED keeps the review (report dismissed)", async () => {
    await resolveReviewFlag("rp1", "DISMISSED", "adm1", NOW);
    expect(db.report.update).toHaveBeenCalledWith({
      where: { id: "rp1" },
      data: expect.objectContaining({ status: "DISMISSED", triageByAdminId: "adm1" }),
    });
  });
});
