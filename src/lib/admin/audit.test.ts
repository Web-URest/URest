import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";

import { listAuditAdmins, loadAuditLog } from "./audit";

const findMany = prisma.auditLog.findMany as unknown as Mock;
const adminFindMany = prisma.user.findMany as unknown as Mock;

describe("loadAuditLog", () => {
  it("returns the newest rows with the admin joined, bounded by the default limit, no filters", async () => {
    findMany.mockResolvedValue([{ id: "a1", admin: { displayName: "Aok" } }]);

    const rows = await loadAuditLog({});

    expect(findMany).toHaveBeenCalledWith({
      where: {},
      include: { admin: { select: { displayName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    expect(rows).toHaveLength(1);
  });

  it("filters by adminId and targetType when both are given", async () => {
    findMany.mockResolvedValue([]);
    await loadAuditLog({ adminId: "adm1", targetType: "Booking" });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { adminId: "adm1", targetType: "Booking" } }),
    );
  });

  it("omits a where key when its filter is absent", async () => {
    findMany.mockResolvedValue([]);
    await loadAuditLog({ targetType: "PayoutAccount" });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { targetType: "PayoutAccount" } }),
    );
    const arg = findMany.mock.calls.at(-1)![0] as { where: Record<string, unknown> };
    expect("adminId" in arg.where).toBe(false);
  });

  it("honors a custom limit", async () => {
    findMany.mockResolvedValue([]);
    await loadAuditLog({ limit: 50 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });
});

describe("listAuditAdmins", () => {
  it("lists role=ADMIN users (id + displayName) sorted by name for the filter dropdown", async () => {
    adminFindMany.mockResolvedValue([{ id: "adm1", displayName: "Aok" }]);
    const admins = await listAuditAdmins();
    expect(adminFindMany).toHaveBeenCalledWith({
      where: { role: "ADMIN" },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    });
    expect(admins[0]!.displayName).toBe("Aok");
  });
});
