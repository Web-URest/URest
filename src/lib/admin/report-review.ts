/**
 * Admin reports-triage coordinator (PRODUCT_FLOWS §5.6, issue #27). Mirrors the
 * #14 listing-review coordinator: each decision composes the state change + an
 * AuditLog row in ONE transaction, then `notify()` after. The accept and strike
 * paths touch the ledger / strike issuer (which read mid-transaction), so they
 * use the interactive `$transaction(async (tx) => …)` form like lib/booking.
 *
 * Money-freeze on a booking report is the ledger FREEZE (HOLD_BOOKING_REPORT) and
 * only fires when escrow is HELD/RELEASABLE — never on NONE/PAID/REVERSED/FROZEN
 * (freeze would throw). The host-wide investigation hold (PayoutHold) is #25.
 */
import { EscrowState, LedgerCause, type HostStrikeReason } from "@prisma/client";

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { freeze } from "@/lib/ledger/apply";
import { openDispute } from "@/lib/booking/transitions";
import { issueStrike } from "@/lib/booking/strikes";
import { unlistListingOp } from "@/lib/listing/review";

import type { AdminPrincipal } from "./auth";

export type ReportReviewErrorReason =
  | "NOT_FOUND"
  | "WRONG_STATE"
  | "NOT_BOOKING_REPORT"
  | "NOT_LISTING_REPORT"
  | "REASON_REQUIRED";

export class ReportReviewError extends Error {
  constructor(public readonly reason: ReportReviewErrorReason) {
    super(reason);
    this.name = "ReportReviewError";
  }
}

const FREEZABLE = new Set<EscrowState>([EscrowState.HELD, EscrowState.RELEASABLE]);
const OPEN_STATUSES = new Set<string>(["RECEIVED", "IN_REVIEW"]);

async function loadReport(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      booking: { select: { id: true, userId: true, escrowState: true, listing: { select: { hostId: true } } } },
      listing: { select: { id: true, hostId: true } },
    },
  });
  if (!report) throw new ReportReviewError("NOT_FOUND");
  return report;
}

/**
 * รับเรื่องเข้าตรวจสอบ — RECEIVED → IN_REVIEW. A booking report auto-freezes the
 * payout when escrow is still HELD/RELEASABLE (not yet PAID); otherwise the report
 * just enters review (no money to hold). [AC#1]
 */
export async function acceptIntoReview(admin: AdminPrincipal, reportId: string): Promise<void> {
  const report = await loadReport(reportId);
  if (report.status !== "RECEIVED") throw new ReportReviewError("WRONG_STATE");
  const now = new Date();

  const willFreeze =
    !!report.bookingId && !!report.booking && FREEZABLE.has(report.booking.escrowState);

  await prisma.$transaction(async (tx) => {
    if (willFreeze && report.bookingId) {
      await freeze(tx, report.bookingId, LedgerCause.HOLD_BOOKING_REPORT, reportId);
    }
    await tx.report.update({
      where: { id: reportId },
      data: { status: "IN_REVIEW", triageByAdminId: admin.id, triageAt: now },
    });
    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: "REPORT_ACCEPTED",
        targetType: "Report",
        targetId: reportId,
        before: { status: "RECEIVED" },
        after: { status: "IN_REVIEW", payoutFrozen: willFreeze },
      },
    });
  });
}

async function closeReport(
  admin: AdminPrincipal,
  reportId: string,
  reason: string,
  status: "RESOLVED" | "DISMISSED",
  action: string,
  templateKey: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new ReportReviewError("REASON_REQUIRED");
  const report = await loadReport(reportId);
  if (!OPEN_STATUSES.has(report.status)) throw new ReportReviewError("WRONG_STATE");
  const now = new Date();

  await prisma.$transaction([
    prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        resolvedReason: trimmed,
        resolvedAt: now,
        triageByAdminId: report.triageByAdminId ?? admin.id,
        triageAt: report.triageAt ?? now,
      },
    }),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action,
        targetType: "Report",
        targetId: reportId,
        before: { status: report.status },
        after: { status, reason: trimmed },
      },
    }),
  ]);

  if (report.reporterId) {
    await notify(report.reporterId, templateKey, { category: report.category, reason: trimmed });
  }
}

/** ปิดเรื่อง — resolve with a reason (reporter sees the decision). [AC#2 terminal] */
export function resolveReport(admin: AdminPrincipal, reportId: string, reason: string): Promise<void> {
  return closeReport(admin, reportId, reason, "RESOLVED", "REPORT_RESOLVED", "REPORT_RESOLVED");
}

/** Dismiss an off-topic / abusive report with a reason. */
export function dismissReport(admin: AdminPrincipal, reportId: string, reason: string): Promise<void> {
  return closeReport(admin, reportId, reason, "DISMISSED", "REPORT_DISMISSED", "REPORT_DISMISSED");
}

/** UNLIST a reported listing pending investigation (§5.6). Listing reports only. [AC#3] */
export async function unlistFromReport(admin: AdminPrincipal, reportId: string): Promise<void> {
  const report = await loadReport(reportId);
  if (!report.listingId || !report.listing) throw new ReportReviewError("NOT_LISTING_REPORT");
  const now = new Date();

  await prisma.$transaction([
    unlistListingOp(report.listingId),
    prisma.report.update({
      where: { id: reportId },
      data: { status: "IN_REVIEW", triageByAdminId: admin.id, triageAt: now },
    }),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: "LISTING_UNLISTED",
        targetType: "Listing",
        targetId: report.listingId,
        before: { status: "PUBLISHED" },
        after: { status: "UNLISTED", reportId },
      },
    }),
  ]);
}

/**
 * Escalate a booking report to a full dispute (§5.6 → §5.3). Wires to the
 * existing `openDispute` (creates the Dispute + freezes escrow); resolution is
 * the #26 admin dispute queue. Booking reports only.
 */
export async function escalateToDispute(admin: AdminPrincipal, reportId: string): Promise<void> {
  const report = await loadReport(reportId);
  if (!report.bookingId || !report.booking) throw new ReportReviewError("NOT_BOOKING_REPORT");

  // openDispute runs its own atomic transaction (Dispute row + escrow freeze).
  await openDispute(report.bookingId, report.booking.userId);

  const now = new Date();
  await prisma.$transaction([
    prisma.report.update({
      where: { id: reportId },
      data: { status: "IN_REVIEW", triageByAdminId: admin.id, triageAt: now },
    }),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: "REPORT_ESCALATED",
        targetType: "Booking",
        targetId: report.bookingId,
        before: { reportStatus: report.status },
        after: { reportStatus: "IN_REVIEW", escalated: true },
      },
    }),
  ]);
}

/**
 * Issue a host strike from a confirmed bad report (§5.4/§5.6). Reuses the
 * suspend-on-3 issuer; the third strike sets `User.suspendedAt`. [AC#4]
 */
export async function strikeHostFromReport(
  admin: AdminPrincipal,
  reportId: string,
  reason: HostStrikeReason,
  now: Date = new Date(),
): Promise<void> {
  const report = await loadReport(reportId);
  const hostId = report.booking?.listing.hostId ?? report.listing?.hostId;
  if (!hostId) throw new ReportReviewError("NOT_FOUND");
  const bookingId = report.bookingId ?? null;

  await prisma.$transaction(async (tx) => {
    await issueStrike(tx, hostId, reason, bookingId, now);
    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: "HOST_STRUCK",
        targetType: "User",
        targetId: hostId,
        after: { reason, reportId, bookingId },
      },
    });
  });
}
