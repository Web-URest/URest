/**
 * Admin dispute case coordinator (PRODUCT_FLOWS §5.3, issue #26). Mirrors the #27
 * report-review coordinator: it composes the read side of the case view and wraps
 * the lib/booking money transitions, notifying both parties after. The state +
 * escrow moves (and their AuditLog rows) live in `lib/booking/transitions`
 * (`resolveDispute`/`resolveAppeal`) — rule 2 — so this module never writes status
 * or escrow itself. The unmasked chat evidence comes from the audited
 * `readDisputeThreadRaw` (the sole bodyRaw read path).
 */
import { prisma } from "@/lib/db";
import { resolveAppeal, resolveDispute, type DisputeResolution } from "@/lib/booking/transitions";
import { readDisputeThreadRaw } from "@/lib/messaging/admin";
import { notify } from "@/lib/notifications";

import type { AdminPrincipal } from "./auth";

export type DisputeReviewErrorReason = "NOT_FOUND";

export class DisputeReviewError extends Error {
  constructor(public readonly reason: DisputeReviewErrorReason) {
    super(reason);
    this.name = "DisputeReviewError";
  }
}

const RESOLVED_STATUSES = ["RESOLVED_RELEASED", "RESOLVED_PARTIAL", "RESOLVED_REFUNDED"] as const;

/**
 * The admin queue (§5.3): disputes awaiting a decision — freshly OPEN cases, plus
 * resolved cases with an appeal armed (a `*AppealedAt` set and the escrow re-frozen
 * by `appealDispute`, awaiting the final re-decision). Oldest first.
 */
export async function listOpenDisputes() {
  const rows = await prisma.dispute.findMany({
    where: {
      OR: [
        { status: "OPEN" },
        {
          status: { in: [...RESOLVED_STATUSES] },
          OR: [{ guestAppealedAt: { not: null } }, { hostAppealedAt: { not: null } }],
          booking: { escrowState: "FROZEN" },
        },
      ],
    },
    select: {
      bookingId: true,
      status: true,
      guestAppealedAt: true,
      hostAppealedAt: true,
      createdAt: true,
      booking: {
        select: {
          code: true,
          escrowState: true,
          listing: { select: { title: true } },
          user: { select: { displayName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((d) => ({
    bookingId: d.bookingId,
    status: d.status,
    code: d.booking.code,
    listingTitle: d.booking.listing.title,
    guestName: d.booking.user.displayName,
    awaitingAppeal: d.status !== "OPEN" && (d.guestAppealedAt !== null || d.hostAppealedAt !== null),
    createdAt: d.createdAt,
  }));
}

/**
 * Full case view: the dispute + its money state, the guest's booking report(s)
 * (category/detail/photos), and the UNMASKED chat thread (audited reveal).
 */
export async function loadDisputeCase(admin: AdminPrincipal, bookingId: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { bookingId },
    select: {
      bookingId: true,
      status: true,
      partialRefundPct: true,
      guestAppealedAt: true,
      hostAppealedAt: true,
      createdAt: true,
      resolvedAt: true,
      booking: {
        select: {
          code: true,
          status: true,
          escrowState: true,
          checkIn: true,
          checkOut: true,
          totalSatang: true,
          userId: true,
          listing: { select: { title: true, hostId: true } },
        },
      },
    },
  });
  if (!dispute) throw new DisputeReviewError("NOT_FOUND");

  const reports = await prisma.report.findMany({
    where: { bookingId },
    select: { id: true, reporterId: true, category: true, text: true, photoKeys: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const thread = await readDisputeThreadRaw(admin, bookingId);

  return { dispute, reports, thread };
}

/** Decision + refund amount for the both-parties notification (refund row is the truth). */
async function notifyParties(bookingId: string, templateKey: string, kind: DisputeResolution["kind"]) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, code: true, listing: { select: { hostId: true, title: true } } },
  });
  if (!booking) return;
  const refund = await prisma.refund.findUnique({ where: { bookingId }, select: { refundSatang: true } });
  const payload = {
    listingTitle: booking.listing.title,
    code: booking.code,
    kind,
    refundSatang: refund?.refundSatang ?? 0,
  };
  await notify(booking.userId, templateKey, payload);
  await notify(booking.listing.hostId, templateKey, payload);
}

/** Resolve an open dispute (release / partial / refund) and notify both parties. */
export async function resolveDisputeCase(
  admin: AdminPrincipal,
  bookingId: string,
  resolution: DisputeResolution,
): Promise<void> {
  await resolveDispute(bookingId, admin.id, resolution, new Date());
  await notifyParties(bookingId, "DISPUTE_RESOLVED", resolution.kind);
}

/** Resolve an armed appeal (final, §5.3) and notify both parties. */
export async function resolveAppealCase(
  admin: AdminPrincipal,
  bookingId: string,
  resolution: DisputeResolution,
): Promise<void> {
  await resolveAppeal(bookingId, admin.id, resolution, new Date());
  await notifyParties(bookingId, "DISPUTE_APPEAL_RESOLVED", resolution.kind);
}
