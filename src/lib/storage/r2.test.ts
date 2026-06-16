import { describe, expect, it } from "vitest";

import { presignGet, presignPut, publicUrl } from "./r2";

// Presigning is offline (local SigV4); the dummy R2 env from vitest.setup.ts is
// enough. We assert URL shape, not a real round-trip (that's the manual R2 check).

describe("r2 presigning (offline)", () => {
  it("presignPut targets the public bucket and signs content-type + expiry", async () => {
    const url = await presignPut({
      bucket: "public",
      key: "listings/l1/a.jpg",
      contentType: "image/jpeg",
      contentLength: 1234,
      expiresIn: 600,
    });
    expect(url).toContain("test-public");
    expect(decodeURIComponent(url)).toContain("listings/l1/a.jpg");
    const q = new URL(url).searchParams;
    expect(q.get("X-Amz-Expires")).toBe("600");
    expect(q.get("X-Amz-SignedHeaders")).toContain("content-type");
  });

  it("presignGet targets the PRIVATE bucket with a short expiry", async () => {
    const url = await presignGet({ key: "kyc/s1/doc", expiresIn: 120 });
    expect(url).toContain("test-private");
    expect(url).not.toContain("test-public");
    expect(decodeURIComponent(url)).toContain("kyc/s1/doc");
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("120");
  });

  it("publicUrl builds an unsigned CDN URL", () => {
    expect(publicUrl("listings/l1/a.jpg")).toBe(
      "https://cdn.test.example/listings/l1/a.jpg",
    );
    expect(publicUrl("x")).not.toContain("X-Amz");
  });
});
