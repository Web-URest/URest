/**
 * Booking lifecycle sweeps (ADR-004). Each finds the rows whose deadline has
 * passed and calls the matching lib/booking transition per row — the sweeps
 * never write status directly (rule 2). Per-row failures are isolated so one
 * bad row never aborts the batch. Pure functions of `now` for testability.
 */
import { BookingStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

import { expire } from "./transitions";

/** Run `fn` for each id, isolating per-row failures; returns the count that succeeded. */
async function forEachRow(
  ids: string[],
  fn: (id: string) => Promise<unknown>,
): Promise<number> {
  let done = 0;
  for (const id of ids) {
    try {
      await fn(id);
      done++;
    } catch (err) {
      console.error(`[cron] booking ${id} sweep failed:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}

/** REQUESTED past respondBy → EXPIRED. */
export async function sweepOverdueRequests(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.REQUESTED, respondBy: { lt: now } },
    select: { id: true },
  });
  return forEachRow(
    rows.map((r) => r.id),
    (id) => expire(id, now),
  );
}

/** AWAITING_PAYMENT past payBy → EXPIRED. */
export async function sweepOverduePayments(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.AWAITING_PAYMENT, payBy: { lt: now } },
    select: { id: true },
  });
  return forEachRow(
    rows.map((r) => r.id),
    (id) => expire(id, now),
  );
}
