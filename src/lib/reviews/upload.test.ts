import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/storage/r2", () => ({ presignPut: vi.fn().mockResolvedValue("https://r2.test/put") }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findUnique: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { presignPut } from "@/lib/storage/r2";

import { presignReviewPhotoUpload } from "./upload";

const findUnique = (prisma as unknown as { booking: { findUnique: Mock } }).booking.findUnique;
const presign = presignPut as unknown as Mock;

const NOW = new Date("2026-06-10T00:00:00Z");
const completed = (over: Record<string, unknown> = {}) => ({
  status: "COMPLETED",
  userId: "guest1",
  checkOut: new Date("2026-06-01T00:00:00Z"),
  code: "c",
  listingId: "lst1",
  listing: { title: "t", hostId: "host1" },
  review: null,
  ...over,
});

afterEach(() => vi.clearAllMocks());

describe("presignReviewPhotoUpload", () => {
  it("gates on review eligibility, then presigns a public key under the booking", async () => {
    findUnique.mockResolvedValue(completed());

    const res = await presignReviewPhotoUpload(
      { bookingId: "bk1", byteLength: 1000, contentType: "image/jpeg" },
      "guest1",
      NOW,
    );

    expect(res.r2Key).toMatch(/^reviews\/bk1\/[\w-]+\.jpg$/);
    expect(res.uploadUrl).toBe("https://r2.test/put");
    expect(presign).toHaveBeenCalledWith(expect.objectContaining({ bucket: "public", key: res.r2Key }));
  });

  it("refuses when the user can't review the booking (not the guest)", async () => {
    findUnique.mockResolvedValue(completed());
    await expect(
      presignReviewPhotoUpload({ bookingId: "bk1", byteLength: 1000, contentType: "image/jpeg" }, "intruder", NOW),
    ).rejects.toThrow();
    expect(presign).not.toHaveBeenCalled();
  });

  it("rejects an unsupported content type", async () => {
    findUnique.mockResolvedValue(completed());
    await expect(
      presignReviewPhotoUpload({ bookingId: "bk1", byteLength: 1000, contentType: "image/gif" }, "guest1", NOW),
    ).rejects.toThrow();
    expect(presign).not.toHaveBeenCalled();
  });
});
