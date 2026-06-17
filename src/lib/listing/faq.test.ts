import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { findUnique: vi.fn() },
    listingFaqEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  createFaqEntry,
  deleteFaqEntry,
  getHostFaqEntries,
  setFaqStatus,
  updateFaqEntry,
} from "./faq";

const listingFindUnique = prisma.listing.findUnique as unknown as Mock;
const faqFindMany = prisma.listingFaqEntry.findMany as unknown as Mock;
const faqFindFirst = prisma.listingFaqEntry.findFirst as unknown as Mock;
const faqFindUnique = prisma.listingFaqEntry.findUnique as unknown as Mock;
const faqCreate = prisma.listingFaqEntry.create as unknown as Mock;
const faqUpdate = prisma.listingFaqEntry.update as unknown as Mock;
const faqDelete = prisma.listingFaqEntry.delete as unknown as Mock;

afterEach(() => vi.clearAllMocks());

describe("getHostFaqEntries", () => {
  it("rejects a non-owner", async () => {
    listingFindUnique.mockResolvedValue({ hostId: "other" });
    await expect(getHostFaqEntries("l1", "h1")).rejects.toMatchObject({
      reason: "NOT_OWNER",
    });
  });

  it("returns all entries (every status) for an owned listing", async () => {
    listingFindUnique.mockResolvedValue({ hostId: "h1" });
    faqFindMany.mockResolvedValue([{ id: "f1" }]);
    const out = await getHostFaqEntries("l1", "h1");
    expect(out).toEqual([{ id: "f1" }]);
    expect(faqFindMany).toHaveBeenCalledWith({
      where: { listingId: "l1" },
      orderBy: { sortOrder: "asc" },
    });
  });
});

describe("createFaqEntry", () => {
  it("appends after the last sortOrder as a HOST/PUBLISHED entry", async () => {
    listingFindUnique.mockResolvedValue({ hostId: "h1" });
    faqFindFirst.mockResolvedValue({ sortOrder: 2 });
    faqCreate.mockResolvedValue({ id: "f1" });
    await createFaqEntry("l1", "h1", { question: "สระลึกไหม", answer: "1.5 ม." });
    expect(faqCreate).toHaveBeenCalledWith({
      data: {
        listingId: "l1",
        question: "สระลึกไหม",
        answer: "1.5 ม.",
        source: "HOST",
        status: "PUBLISHED",
        sortOrder: 3,
      },
    });
  });

  it("starts at sortOrder 0 for the first entry", async () => {
    listingFindUnique.mockResolvedValue({ hostId: "h1" });
    faqFindFirst.mockResolvedValue(null);
    faqCreate.mockResolvedValue({ id: "f1" });
    await createFaqEntry("l1", "h1", { question: "q", answer: "a" });
    expect(faqCreate.mock.calls[0]?.[0].data.sortOrder).toBe(0);
  });
});

describe("ownership on entry-scoped mutations", () => {
  it("updateFaqEntry rejects a non-owner", async () => {
    faqFindUnique.mockResolvedValue({ id: "f1", listing: { hostId: "other" } });
    await expect(
      updateFaqEntry("f1", "h1", { question: "q", answer: "a" }),
    ).rejects.toMatchObject({ reason: "NOT_OWNER" });
    expect(faqUpdate).not.toHaveBeenCalled();
  });

  it("setFaqStatus toggles when owned", async () => {
    faqFindUnique.mockResolvedValue({ id: "f1", listing: { hostId: "h1" } });
    faqUpdate.mockResolvedValue({ id: "f1", status: "DRAFT" });
    await setFaqStatus("f1", "h1", "DRAFT" as never);
    expect(faqUpdate).toHaveBeenCalledWith({ where: { id: "f1" }, data: { status: "DRAFT" } });
  });

  it("deleteFaqEntry removes when owned", async () => {
    faqFindUnique.mockResolvedValue({ id: "f1", listing: { hostId: "h1" } });
    await deleteFaqEntry("f1", "h1");
    expect(faqDelete).toHaveBeenCalledWith({ where: { id: "f1" } });
  });

  it("deleteFaqEntry throws NOT_FOUND when the entry is missing", async () => {
    faqFindUnique.mockResolvedValue(null);
    await expect(deleteFaqEntry("f1", "h1")).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });
});
