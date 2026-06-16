import { describe, expect, it } from "vitest";

import { kycDocumentSignedUrl, presignKycUpload } from "./storage";

const ok = { submissionId: "s1", contentType: "application/pdf", byteLength: 2_000 };

describe("presignKycUpload", () => {
  it("uploads to the PRIVATE bucket with a kyc-namespaced key", async () => {
    const { r2Key, uploadUrl } = await presignKycUpload(ok);
    expect(r2Key).toMatch(/^kyc\/s1\/[0-9a-f-]+$/);
    expect(uploadUrl).toContain("test-private");
    expect(uploadUrl).not.toContain("test-public");
  });

  it("rejects non-KYC types (e.g. webp) and out-of-range sizes", async () => {
    await expect(
      presignKycUpload({ ...ok, contentType: "image/webp" }),
    ).rejects.toThrow(/type/i);
    await expect(presignKycUpload({ ...ok, byteLength: 0 })).rejects.toThrow(
      /size/i,
    );
  });
});

describe("kycDocumentSignedUrl", () => {
  it("returns a short-lived signed GET on the private bucket", async () => {
    const url = await kycDocumentSignedUrl("kyc/s1/doc", 120);
    expect(url).toContain("test-private");
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("120");
  });
});
