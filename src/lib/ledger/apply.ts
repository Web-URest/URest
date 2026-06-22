/**
 * Escrow write layer (ADR-003). The ONLY code that inserts `LedgerEntry` rows
 * and updates `Booking.escrowState`. Every function takes the caller's
 * transaction client, so a status change in lib/booking and the escrow move it
 * triggers commit together (charge → CONFIRMED + HELD, etc.).
 *
 * The pure decisions live in `escrow.ts`; this module only derives the current
 * position from the log, runs `reduce`, and persists the result.
 */

import { EscrowState, LedgerCause, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import {
  EMPTY_BUCKETS,
  foldMove,
  reduce,
  type Buckets,
  type EscrowEvent,
  type FreezeCause,
  type Position,
  type RefundCause,
} from "./escrow";

type Tx = Prisma.TransactionClient;

interface MoveMeta {
  /** Opn event id, admin (role=ADMIN User) id, Dispute id, … — what authorized the move. */
  causeRef?: string | null;
  actor?: string | null;
}

/**
 * Global escrow totals — fold the ENTIRE `LedgerEntry` log into the running
 * buckets. The reconciliation reference for the payout admin (#25): the in-escrow
 * obligation we must be solvent against. O(entries) is fine at pilot volume; uses
 * the non-tx client (read-only, outside any booking transaction).
 */
export async function ledgerTotals(): Promise<Buckets> {
  const entries = await prisma.ledgerEntry.findMany({
    select: { fromState: true, toState: true, amountSatang: true },
  });

  let buckets = EMPTY_BUCKETS;
  for (const e of entries) {
    buckets = foldMove(buckets, {
      fromState: e.fromState ?? EscrowState.NONE,
      toState: e.toState,
      amountSatang: e.amountSatang,
      cause: LedgerCause.CHARGE_WEBHOOK, // cause is irrelevant to the money fold
    });
  }

  return buckets;
}

/** Derive a booking's current escrow position from its append-only ledger log. */
export async function currentPosition(tx: Tx, bookingId: string): Promise<Position> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { escrowState: true },
  });
  const entries = await tx.ledgerEntry.findMany({
    where: { bookingId },
    select: { fromState: true, toState: true, amountSatang: true },
  });

  let buckets = EMPTY_BUCKETS;
  for (const e of entries) {
    buckets = foldMove(buckets, {
      fromState: e.fromState ?? EscrowState.NONE,
      toState: e.toState,
      amountSatang: e.amountSatang,
      cause: LedgerCause.CHARGE_WEBHOOK, // cause is irrelevant to the money fold
    });
  }

  return {
    state: booking.escrowState,
    amountSatang: buckets.held + buckets.releasable + buckets.frozen,
  };
}

/** Apply one escrow event: append the move(s), then refresh the escrowState cache. */
async function applyEvent(
  tx: Tx,
  bookingId: string,
  event: EscrowEvent,
  meta: MoveMeta = {},
): Promise<Position> {
  const position = await currentPosition(tx, bookingId);
  const { position: next, moves } = reduce(position, event);

  await tx.ledgerEntry.createMany({
    data: moves.map((m) => ({
      bookingId,
      amountSatang: m.amountSatang,
      fromState: m.fromState,
      toState: m.toState,
      cause: m.cause,
      causeRef: meta.causeRef ?? null,
      actor: meta.actor ?? null,
    })),
  });
  await tx.booking.update({ where: { id: bookingId }, data: { escrowState: next.state } });

  return next;
}

/**
 * Claim an Opn webhook event for processing (rule 6). Returns `false` if the
 * event id was already recorded (a replay) so the caller can no-op. Uses
 * `skipDuplicates` (ON CONFLICT DO NOTHING) so a replay never poisons the
 * surrounding transaction.
 */
export async function claimWebhookEvent(
  tx: Tx,
  opnEventId: string,
  payload: Prisma.InputJsonValue,
  now: Date,
): Promise<boolean> {
  const { count } = await tx.webhookEvent.createMany({
    data: [{ opnEventId, payload, processedAt: now }],
    skipDuplicates: true,
  });
  return count > 0;
}

// ── Named escrow moves (PRODUCT_FLOWS §2.3). lib/booking calls these with its tx.

/** NONE → HELD on a successful Opn charge. */
export function recordCharge(tx: Tx, bookingId: string, amountSatang: number, opnEventId: string) {
  return applyEvent(tx, bookingId, { type: "CHARGE", amountSatang }, { causeRef: opnEventId });
}

/** HELD → RELEASABLE at checkout when there's no open dispute. */
export function release(tx: Tx, bookingId: string) {
  return applyEvent(tx, bookingId, { type: "RELEASE" });
}

/** {HELD|RELEASABLE} → FROZEN for a dispute, booking report, or admin hold. */
export function freeze(tx: Tx, bookingId: string, cause: FreezeCause, causeRef?: string) {
  return applyEvent(tx, bookingId, { type: "FREEZE", cause }, { causeRef });
}

/** RELEASABLE → PAID when an admin executes the bank transfer. */
export function payout(tx: Tx, bookingId: string, adminId: string) {
  return applyEvent(tx, bookingId, { type: "PAY" }, { causeRef: adminId, actor: adminId });
}

/**
 * Settle an in-escrow booking ({HELD|FROZEN}): refund `refundSatang` to the
 * guest and release the remainder to the host. Covers guest/host cancellations
 * and dispute resolutions (full, partial, or released-to-host with `refundSatang`
 * of 0). The refund amount comes from `lib/booking/refund.ts`.
 */
export function settle(
  tx: Tx,
  bookingId: string,
  refundSatang: number,
  refundCause: RefundCause,
  causeRef?: string,
) {
  return applyEvent(tx, bookingId, { type: "SETTLE", refundSatang, refundCause }, { causeRef });
}
