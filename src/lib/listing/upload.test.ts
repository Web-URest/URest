import { describe, expect, it } from "vitest";

import { photoUrl, presignPhotoUpload } from "./upload";

const ok = {
  listingId: "l1",
  fileName: "beach.jpg",
  byteLength: 1_000,
  contentType: "image/jpeg",
};

describe("presignPhotoUpload", () => {
  it("returns a listing-namespaced public key + a presigned upload URL", async () => {
    const { r2Key, uploadUrl } = await presignPhotoUpload(ok);
    expect(r2Key).toMatch(/^listings\/l1\/[0-9a-f-]+\.jpg$/);
    expect(uploadUrl).toContain("test-public");
    expect(decodeURIComponent(uploadUrl)).toContain(r2Key);
  });

  it("rejects an unsupported type", async () => {
    await expect(
      presignPhotoUpload({ ...ok, contentType: "image/gif" }),
    ).rejects.toThrow(/type/i);
  });

  it("rejects oversize and zero-byte uploads", async () => {
    await expect(
      presignPhotoUpload({ ...ok, byteLength: 11 * 1024 * 1024 }),
    ).rejects.toThrow(/size/i);
    await expect(presignPhotoUpload({ ...ok, byteLength: 0 })).rejects.toThrow(
      /size/i,
    );
  });

  it("photoUrl builds a CDN URL", () => {
    expect(photoUrl("listings/l1/a.jpg")).toBe(
      "https://cdn.test.example/listings/l1/a.jpg",
    );
  });
});
