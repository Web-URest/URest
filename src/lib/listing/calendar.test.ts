import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { findUnique: vi.fn() },
    calendarBlock: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { addCalendarBlock, getHostCalendar, removeCalendarBlock } from "./calendar";

const listingFindUnique = prisma.listing.findUnique as unknown as Mock;
const blockFindUnique = prisma.calendarBlock.findUnique as unknown as Mock;
const blockCreate = prisma.calendarBlock.create as unknown as Mock;
const blockDelete = prisma.calendarBlock.delete as unknown as Mock;
const blockFindMany = prisma.calendarBlock.findMany as unknown as Mock;

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

afterEach(() => vi.clearAllMocks());

describe("addCalendarBlock", () => {
  it("throws NOT_FOUND when the listing is missing", async () => {
    listingFindUnique.mockResolvedValue(null);
    await expect(
      addCalendarBlock("l1", "h1", utc("2026-07-01"), utc("2026-07-03")),
    ).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });

  it("throws NOT_OWNER for another host's listing", async () => {
    listingFindUnique.mockResolvedValue({ hostId: "other" });
    await expect(
      addCalendarBlock("l1", "h1", utc("2026-07-01"), utc("2026-07-03")),
    ).rejects.toMatchObject({ reason: "NOT_OWNER" });
  });

  it("creates the block for an owned listing", async () => {
    listingFindUnique.mockResolvedValue({ hostId: "h1" });
    blockCreate.mockResolvedValue({ id: "b1" });
    await addCalendarBlock("l1", "h1", utc("2026-07-01"), utc("2026-07-03"), "ซ่อมแซม");
    expect(blockCreate).toHaveBeenCalledWith({
      data: {
        listingId: "l1",
        startDate: utc("2026-07-01"),
        endDate: utc("2026-07-03"),
        note: "ซ่อมแซม",
      },
    });
  });
});

describe("removeCalendarBlock", () => {
  it("throws NOT_OWNER when the block's listing belongs to someone else", async () => {
    blockFindUnique.mockResolvedValue({ listing: { hostId: "other" } });
    await expect(removeCalendarBlock("b1", "h1")).rejects.toMatchObject({
      reason: "NOT_OWNER",
    });
    expect(blockDelete).not.toHaveBeenCalled();
  });

  it("deletes a block on an owned listing", async () => {
    blockFindUnique.mockResolvedValue({ listing: { hostId: "h1" } });
    await removeCalendarBlock("b1", "h1");
    expect(blockDelete).toHaveBeenCalledWith({ where: { id: "b1" } });
  });
});

describe("getHostCalendar", () => {
  it("returns blocks ending on or after the window start, owner-gated", async () => {
    listingFindUnique.mockResolvedValue({ hostId: "h1" });
    blockFindMany.mockResolvedValue([{ id: "b1" }]);
    const from = utc("2026-07-01");
    const out = await getHostCalendar("l1", "h1", from);
    expect(out).toEqual([{ id: "b1" }]);
    expect(blockFindMany).toHaveBeenCalledWith({
      where: { listingId: "l1", endDate: { gte: from } },
      orderBy: { startDate: "asc" },
    });
  });
});
