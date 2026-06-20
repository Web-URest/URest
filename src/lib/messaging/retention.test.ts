import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { message: { deleteMany: vi.fn() } },
}));

import { prisma } from "@/lib/db";

import { purgeOldMessages } from "./retention";

const deleteMany = prisma.message.deleteMany as unknown as Mock;
const NOW = new Date("2026-06-20T03:00:00.000Z");
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

describe("purgeOldMessages", () => {
  it("deletes messages older than 12 months", async () => {
    deleteMany.mockResolvedValue({ count: 5 });

    const n = await purgeOldMessages(NOW);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - YEAR_MS) } },
    });
    expect(n).toBe(5);
  });
});
