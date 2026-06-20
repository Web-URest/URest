import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { conciergeSession: { deleteMany: vi.fn() } },
}));

import { prisma } from "@/lib/db";

import { purgeConciergeTranscripts } from "./retention";

const deleteMany = prisma.conciergeSession.deleteMany as unknown as Mock;
const NOW = new Date("2026-06-20T03:00:00.000Z");
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

describe("purgeConciergeTranscripts", () => {
  it("deletes sessions older than 12 months (cascading their transcripts)", async () => {
    deleteMany.mockResolvedValue({ count: 3 });

    const n = await purgeConciergeTranscripts(NOW);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - YEAR_MS) } },
    });
    expect(n).toBe(3);
  });
});
