/**
 * Admin audit-log viewer reads (#36, DESIGN_SPEC §9 B11). The AuditLog table only
 * grows (every admin action across lib/admin + lib/booking + lib/reviews +
 * lib/messaging writes here), so reads are bounded (newest N) + filterable by admin
 * and target type, using the existing `@@index([adminId, createdAt])` /
 * `@@index([targetType, targetId])`. Read-only.
 */
import { prisma } from "@/lib/db";

/** The `targetType` values written across the codebase — the viewer's filter set. */
export const AUDIT_TARGET_TYPES = [
  "Booking",
  "Listing",
  "PayoutAccount",
  "PayoutHold",
  "Report",
  "Review",
  "Message",
  "User",
  "AdminUser",
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

const DEFAULT_LIMIT = 200;

export interface AuditFilter {
  adminId?: string;
  targetType?: string;
  limit?: number;
}

export async function loadAuditLog(filter: AuditFilter) {
  return prisma.auditLog.findMany({
    where: {
      ...(filter.adminId ? { adminId: filter.adminId } : {}),
      ...(filter.targetType ? { targetType: filter.targetType } : {}),
    },
    include: { admin: { select: { displayName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: filter.limit ?? DEFAULT_LIMIT,
  });
}

export const AUDIT_LIMIT = DEFAULT_LIMIT;

/** Admins for the viewer's "filter by admin" dropdown. */
export async function listAuditAdmins(): Promise<{ id: string; displayName: string }[]> {
  return prisma.adminUser.findMany({
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
}
