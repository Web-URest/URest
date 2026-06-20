import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { kycDocument: { findMany: vi.fn(), delete: vi.fn() } },
}));
vi.mock("@/lib/storage/r2", () => ({ deleteObject: vi.fn() }));

import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage/r2";

import { purgeRejectedKycDocs } from "./retention";

const findMany = prisma.kycDocument.findMany as unknown as Mock;
const del = prisma.kycDocument.delete as unknown as Mock;
const delObj = deleteObject as unknown as Mock;

const NOW = new Date("2026-06-20T03:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  delObj.mockResolvedValue(undefined);
  del.mockResolvedValue({});
});

describe("purgeRejectedKycDocs", () => {
  it("deletes the R2 object then the row for every doc past purgeAfter", async () => {
    findMany.mockResolvedValue([
      { id: "d1", r2Key: "kyc/s1/THAI_ID" },
      { id: "d2", r2Key: "kyc/s1/SELFIE" },
    ]);

    const n = await purgeRejectedKycDocs(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: { purgeAfter: { lt: NOW } },
      select: { id: true, r2Key: true },
    });
    expect(delObj).toHaveBeenCalledWith({ bucket: "private", key: "kyc/s1/THAI_ID" });
    expect(del).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(n).toBe(2);
  });

  it("isolates a failed R2 delete and keeps purging the rest", async () => {
    findMany.mockResolvedValue([
      { id: "d1", r2Key: "k1" },
      { id: "d2", r2Key: "k2" },
    ]);
    delObj.mockRejectedValueOnce(new Error("r2 down"));

    const n = await purgeRejectedKycDocs(NOW);

    expect(n).toBe(1); // d1 failed before its row delete; d2 succeeded
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith({ where: { id: "d2" } });
  });
});
