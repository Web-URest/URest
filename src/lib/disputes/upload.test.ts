import { describe, expect, it, vi, afterEach, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { booking: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/storage/r2", () => ({
  presignPut: vi.fn().mockResolvedValue("https://r2.example/signed"),
}));

import { prisma } from "@/lib/db";
import { presignPut } from "@/lib/storage/r2";
import { presignDisputePhotoUpload } from "./upload";

const bookingFind = prisma.booking.findUnique as unknown as Mock;
const presignPutMock = presignPut as unknown as Mock;

afterEach(() => vi.clearAllMocks());

const checkedIn = { id: "bk1", userId: "guest1", status: "CHECKED_IN" };

describe("presignDisputePhotoUpload", () => {
  it("presigns a PRIVATE-bucket PUT for the guest of a CHECKED_IN booking", async () => {
    bookingFind.mockResolvedValue(checkedIn);
    const result = await presignDisputePhotoUpload(
      { bookingId: "bk1", byteLength: 1234, contentType: "image/jpeg" },
      "guest1",
    );
    expect(result.r2Key).toMatch(/^disputes\/bk1\/[0-9a-f-]+\.jpg$/);
    expect(result.uploadUrl).toBe("https://r2.example/signed");
    expect(presignPutMock).toHaveBeenCalledWith({
      bucket: "private",
      key: result.r2Key,
      contentType: "image/jpeg",
      contentLength: 1234,
    });
  });

  it("rejects a user who is not the booking's guest", async () => {
    bookingFind.mockResolvedValue(checkedIn);
    await expect(
      presignDisputePhotoUpload({ bookingId: "bk1", byteLength: 10, contentType: "image/png" }, "stranger"),
    ).rejects.toThrow();
    expect(presignPutMock).not.toHaveBeenCalled();
  });

  it("rejects a booking that is not CHECKED_IN", async () => {
    bookingFind.mockResolvedValue({ ...checkedIn, status: "COMPLETED" });
    await expect(
      presignDisputePhotoUpload({ bookingId: "bk1", byteLength: 10, contentType: "image/png" }, "guest1"),
    ).rejects.toThrow();
    expect(presignPutMock).not.toHaveBeenCalled();
  });

  it("rejects a missing booking", async () => {
    bookingFind.mockResolvedValue(null);
    await expect(
      presignDisputePhotoUpload({ bookingId: "bk1", byteLength: 10, contentType: "image/png" }, "guest1"),
    ).rejects.toThrow();
  });

  it("rejects an unsupported content type before signing", async () => {
    bookingFind.mockResolvedValue(checkedIn);
    await expect(
      presignDisputePhotoUpload({ bookingId: "bk1", byteLength: 10, contentType: "application/pdf" }, "guest1"),
    ).rejects.toThrow();
    expect(presignPutMock).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range size before signing", async () => {
    bookingFind.mockResolvedValue(checkedIn);
    await expect(
      presignDisputePhotoUpload(
        { bookingId: "bk1", byteLength: 11 * 1024 * 1024, contentType: "image/jpeg" },
        "guest1",
      ),
    ).rejects.toThrow();
    expect(presignPutMock).not.toHaveBeenCalled();
  });
});
