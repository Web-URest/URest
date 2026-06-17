/**
 * Booking state machine (CLAUDE.md rule 2, PRODUCT_FLOWS §2.1).
 *
 * This module is the ONLY place that writes `Booking.status`. Pages, API routes,
 * the Opn webhook handler, and the cron sweeper call these functions — they never
 * touch the status field directly. Every transition re-checks the current state,
 * so a stale caller can't drive an illegal move. Money moves are delegated to
 * `lib/ledger` (the only writer of `escrowState`), sharing this module's
 * transaction where status and escrow must commit together (ADR-003).
 *
 * Callers (webhook route, cron, UI flows) and the user-facing strings live in the
 * Phase-3 flow issues (#20–#28); this is the domain layer they build on.
 */

import {
  BookingMode,
  BookingStatus,
  CancellationTier,
  EscrowState,
  LedgerCause,
  type Booking,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { claimWebhookEvent, freeze, recordCharge, release, settle } from "@/lib/ledger/apply";
import { issueBookingCode } from "@/lib/ledger/code";

import { breakdown, computeRefund, refundSatangForPct, type RefundBreakdown } from "./refund";

export type BookingErrorReason =
  | "NOT_FOUND"
  | "NOT_GUEST" // the acting user isn't this booking's guest
  | "NOT_HOST" // the acting user isn't the listing's host
  | "WRONG_STATE" // the booking isn't in a state this transition accepts
  | "DEADLINE_NOT_PASSED" // expiry attempted before the timer elapsed
  | "DISPUTE_NOT_OPEN";

export class BookingError extends Error {
  constructor(public readonly reason: BookingErrorReason) {
    super(reason);
    this.name = "BookingError";
  }
}

const HOST_RESPOND_HOURS = 12; // REQUESTED → host must accept within 12h
const PAY_HOURS_REQUEST = 12; // AWAITING_PAYMENT (request mode) → pay within 12h
const PAY_HOURS_INSTANT = 1; // AWAITING_PAYMENT (instant mode) → pay within 1h
const STRIKE_SUSPENSION_THRESHOLD = 3; // ADR-012 §2: 3 strikes → host suspended

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function addHours(at: Date, hours: number): Date {
  return new Date(at.getTime() + hours * MS_PER_HOUR);
}

/** Whole days between `now` and `checkIn` (clamped at 0) — drives the refund tier. */
function daysUntil(checkIn: Date, now: Date): number {
  return Math.max(0, Math.floor((checkIn.getTime() - now.getTime()) / MS_PER_DAY));
}

/** The booking-creation snapshot (ADR-011 №3) — built by lib/pricing at request time. */
export interface BookingDraft {
  listingId: string;
  userId: string;
  checkIn: Date;
  checkOut: Date;
  priceLines: Prisma.InputJsonValue;
  totalSatang: number;
  commissionSatang: number;
  cancellationTier: CancellationTier;
  houseRulesText?: string | null;
}

function createData(draft: BookingDraft) {
  return {
    listingId: draft.listingId,
    userId: draft.userId,
    checkIn: draft.checkIn,
    checkOut: draft.checkOut,
    priceLines: draft.priceLines,
    totalSatang: draft.totalSatang,
    commissionSatang: draft.commissionSatang,
    cancellationTier: draft.cancellationTier,
    houseRulesText: draft.houseRulesText ?? null,
  };
}

// ── Entry transitions ───────────────────────────────────────────────────────

/** [start] → REQUESTED (request mode, §2.1). Host has `HOST_RESPOND_HOURS` to accept. */
export function request(draft: BookingDraft, now: Date): Promise<Booking> {
  return prisma.booking.create({
    data: {
      ...createData(draft),
      status: BookingStatus.REQUESTED,
      bookingMode: BookingMode.REQUEST,
      respondBy: addHours(now, HOST_RESPOND_HOURS),
    },
  });
}

/**
 * [start] → AWAITING_PAYMENT (instant mode, §2.1). Guest has `PAY_HOURS_INSTANT`
 * to pay. The booking is now in the double-booking exclusion set, so the DB
 * rejects an overlapping instant hold.
 */
export function instantHold(draft: BookingDraft, now: Date): Promise<Booking> {
  return prisma.booking.create({
    data: {
      ...createData(draft),
      status: BookingStatus.AWAITING_PAYMENT,
      bookingMode: BookingMode.INSTANT,
      payBy: addHours(now, PAY_HOURS_INSTANT),
    },
  });
}

// ── Host responses to a request ───────────────────────────────────────────────

/** REQUESTED → AWAITING_PAYMENT (§2.1). Guest then has `PAY_HOURS_REQUEST` to pay. */
export async function accept(bookingId: string, hostId: string, now: Date): Promise<Booking> {
  await loadForHost(bookingId, hostId, BookingStatus.REQUESTED);
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.AWAITING_PAYMENT, payBy: addHours(now, PAY_HOURS_REQUEST) },
  });
}

/** REQUESTED → DECLINED (§2.1). No host penalty. */
export async function decline(bookingId: string, hostId: string): Promise<Booking> {
  await loadForHost(bookingId, hostId, BookingStatus.REQUESTED);
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.DECLINED },
  });
}

// ── Cron-swept timer expiries ─────────────────────────────────────────────────

/**
 * REQUESTED | AWAITING_PAYMENT → EXPIRED (§2.1, cron sweep). The booking was
 * never charged, so there's no escrow to unwind. Guards that the relevant timer
 * has actually elapsed so a mis-aimed sweep can't expire a live booking.
 */
export async function expire(bookingId: string, now: Date): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new BookingError("NOT_FOUND");

  const deadline =
    booking.status === BookingStatus.REQUESTED
      ? booking.respondBy
      : booking.status === BookingStatus.AWAITING_PAYMENT
        ? booking.payBy
        : null;
  if (!deadline) throw new BookingError("WRONG_STATE");
  if (deadline > now) throw new BookingError("DEADLINE_NOT_PASSED");

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.EXPIRED },
  });
}

// ── Payment confirmation (Opn webhook) ────────────────────────────────────────

export interface ConfirmInput {
  bookingId: string;
  /** Opn event id — recorded for idempotency before processing (rule 6). */
  opnEventId: string;
  payload: Prisma.InputJsonValue;
}

/**
 * AWAITING_PAYMENT → CONFIRMED on a successful Opn charge (§2.1). In one
 * transaction: claim the webhook event (replays no-op), mint the UR-YYMM-NNNN
 * code, unmask contact info, and move escrow NONE → HELD. Idempotent: a replayed
 * event id returns the already-confirmed booking untouched.
 */
export function confirmFromWebhook(input: ConfirmInput, now: Date): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) throw new BookingError("NOT_FOUND");

    const fresh = await claimWebhookEvent(tx, input.opnEventId, input.payload, now);
    if (!fresh) return booking; // replay — already processed, no-op

    if (booking.status !== BookingStatus.AWAITING_PAYMENT) throw new BookingError("WRONG_STATE");

    const code = await issueBookingCode(tx, now);
    const confirmed = await tx.booking.update({
      where: { id: input.bookingId },
      data: { status: BookingStatus.CONFIRMED, code, contactUnmaskedAt: now },
    });
    await recordCharge(tx, input.bookingId, booking.totalSatang, input.opnEventId);
    return confirmed;
  });
}

// ── Stay lifecycle (cron-swept at Bangkok 15:00 / 11:00) ──────────────────────

/** CONFIRMED → CHECKED_IN (§2.1, cron at check-in 15:00 Bangkok). */
export async function checkIn(bookingId: string): Promise<Booking> {
  await loadInStatus(bookingId, BookingStatus.CONFIRMED);
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.CHECKED_IN },
  });
}

/**
 * CHECKED_IN → COMPLETED (§2.1, cron at checkout 11:00 Bangkok). With no open
 * dispute the escrow releases HELD → RELEASABLE for the payout due-list. (A
 * disputed stay is in DISPUTED, not CHECKED_IN, so it never reaches here.)
 */
export function complete(bookingId: string): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new BookingError("NOT_FOUND");
    if (booking.status !== BookingStatus.CHECKED_IN) throw new BookingError("WRONG_STATE");

    const completed = await tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.COMPLETED },
    });
    if (booking.escrowState === EscrowState.HELD) await release(tx, bookingId);
    return completed;
  });
}

// ── Cancellations ─────────────────────────────────────────────────────────────

/**
 * → CANCELLED_BY_GUEST (§2.1). Before payment it's a clean withdrawal; from
 * CONFIRMED the guest is refunded per the snapshotted tier (§3.6) and the
 * retained remainder is released to the host.
 */
export function cancelByGuest(bookingId: string, userId: string, now: Date): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new BookingError("NOT_FOUND");
    if (booking.userId !== userId) throw new BookingError("NOT_GUEST");

    const prePayment =
      booking.status === BookingStatus.REQUESTED ||
      booking.status === BookingStatus.AWAITING_PAYMENT;
    if (!prePayment && booking.status !== BookingStatus.CONFIRMED) {
      throw new BookingError("WRONG_STATE");
    }

    const cancelled = await tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED_BY_GUEST },
    });

    if (booking.status === BookingStatus.CONFIRMED) {
      const refund = computeRefund({
        totalSatang: booking.totalSatang,
        tier: booking.cancellationTier,
        daysBeforeCheckIn: daysUntil(booking.checkIn, now),
      });
      await recordRefund(tx, bookingId, refund, "guest cancellation");
      await settle(tx, bookingId, refund.refundSatang, LedgerCause.REFUND_GUEST_TIER);
    }
    return cancelled;
  });
}

/**
 * CONFIRMED → CANCELLED_BY_HOST (§2.1, ADR-012). The guest gets a 100% refund,
 * the host takes a strike, and a third strike suspends the host.
 */
export function cancelByHost(bookingId: string, hostId: string, now: Date): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const booking = await loadForHost(bookingId, hostId, BookingStatus.CONFIRMED, tx);

    const cancelled = await tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED_BY_HOST },
    });
    await recordRefund(tx, bookingId, breakdown(booking.totalSatang, booking.totalSatang), "host cancellation");
    await settle(tx, bookingId, booking.totalSatang, LedgerCause.REFUND_HOST_CANCELLED);
    await strikeHost(tx, booking.listing.hostId, bookingId, now);
    return cancelled;
  });
}

// ── Disputes ──────────────────────────────────────────────────────────────────

/**
 * CHECKED_IN → DISPUTED (§2.1, §5.3). Opens a Dispute and freezes the payout.
 * Resolution (admin queue) lands in #26; this is the transition it builds on.
 */
export function openDispute(bookingId: string, userId: string): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new BookingError("NOT_FOUND");
    if (booking.userId !== userId) throw new BookingError("NOT_GUEST");
    if (booking.status !== BookingStatus.CHECKED_IN) throw new BookingError("WRONG_STATE");

    const disputed = await tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.DISPUTED },
    });
    const dispute = await tx.dispute.create({ data: { bookingId } });
    await freeze(tx, bookingId, LedgerCause.HOLD_DISPUTE_OPENED, dispute.id);
    return disputed;
  });
}

export type DisputeResolution =
  | { kind: "RELEASED" } // 100% to host
  | { kind: "PARTIAL"; refundPct: number } // refundPct% to guest, rest to host
  | { kind: "REFUNDED" }; // 100% to guest, host fault

/**
 * DISPUTED → COMPLETED (released/partial) or CANCELLED_BY_HOST (refunded, host
 * fault → strike), per §2.1 / §5.3. Moves the frozen escrow accordingly.
 */
export function resolveDispute(
  bookingId: string,
  adminId: string,
  resolution: DisputeResolution,
  now: Date,
): Promise<Booking> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { listing: { select: { hostId: true } }, dispute: true },
    });
    if (!booking) throw new BookingError("NOT_FOUND");
    if (booking.status !== BookingStatus.DISPUTED) throw new BookingError("WRONG_STATE");
    if (!booking.dispute || booking.dispute.status !== "OPEN") {
      throw new BookingError("DISPUTE_NOT_OPEN");
    }

    if (resolution.kind === "RELEASED") {
      await tx.dispute.update({
        where: { bookingId },
        data: { status: "RESOLVED_RELEASED", resolvedAt: now },
      });
      await settle(tx, bookingId, 0, LedgerCause.REFUND_DISPUTE_FULL, adminId);
      return tx.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.COMPLETED } });
    }

    if (resolution.kind === "PARTIAL") {
      const refund = breakdown(
        booking.totalSatang,
        refundSatangForPct(booking.totalSatang, resolution.refundPct),
      );
      await tx.dispute.update({
        where: { bookingId },
        data: { status: "RESOLVED_PARTIAL", partialRefundPct: resolution.refundPct, resolvedAt: now },
      });
      await recordRefund(tx, bookingId, refund, "dispute partial resolution");
      await settle(tx, bookingId, refund.refundSatang, LedgerCause.REFUND_DISPUTE_PARTIAL, adminId);
      return tx.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.COMPLETED } });
    }

    // REFUNDED — host fault: full refund + strike, booking → CANCELLED_BY_HOST.
    await tx.dispute.update({
      where: { bookingId },
      data: { status: "RESOLVED_REFUNDED", resolvedAt: now },
    });
    await recordRefund(tx, bookingId, breakdown(booking.totalSatang, booking.totalSatang), "dispute refunded");
    await settle(tx, bookingId, booking.totalSatang, LedgerCause.REFUND_DISPUTE_FULL, adminId);
    await strikeHost(tx, booking.listing.hostId, bookingId, now);
    return tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED_BY_HOST },
    });
  });
}

// Note: the RELEASABLE → PAID escrow move (§5.2) doesn't change Booking.status,
// so it lives in lib/ledger (`payout`). The admin payout operation (#25) calls it
// directly alongside the Payout row + AuditLog write.

// ── Shared helpers ──────────────────────────────────────────────────────────────

type Db = Prisma.TransactionClient | typeof prisma;

/** Load a booking + its listing host, asserting host ownership and expected status. */
async function loadForHost(
  bookingId: string,
  hostId: string,
  status: BookingStatus,
  db: Db = prisma,
) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { listing: { select: { hostId: true } } },
  });
  if (!booking) throw new BookingError("NOT_FOUND");
  if (booking.listing.hostId !== hostId) throw new BookingError("NOT_HOST");
  if (booking.status !== status) throw new BookingError("WRONG_STATE");
  return booking;
}

async function loadInStatus(bookingId: string, status: BookingStatus, db: Db = prisma) {
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new BookingError("NOT_FOUND");
  if (booking.status !== status) throw new BookingError("WRONG_STATE");
  return booking;
}

function recordRefund(
  tx: Prisma.TransactionClient,
  bookingId: string,
  refund: RefundBreakdown,
  reason: string,
) {
  return tx.refund.create({ data: { bookingId, ...refund, reason } });
}

/** Record a host strike; a third strike suspends the host (ADR-012 §2). */
async function strikeHost(
  tx: Prisma.TransactionClient,
  hostUserId: string,
  bookingId: string,
  now: Date,
): Promise<void> {
  await tx.hostStrike.create({
    data: { hostUserId, bookingId, reason: "HOST_CANCELLED" },
  });
  const strikes = await tx.hostStrike.count({ where: { hostUserId } });
  if (strikes >= STRIKE_SUSPENSION_THRESHOLD) {
    await tx.user.update({ where: { id: hostUserId }, data: { suspendedAt: now } });
  }
}
