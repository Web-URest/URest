/**
 * Booking lifecycle sweeps (ADR-004). Each finds the rows whose deadline has
 * passed and calls the matching lib/booking transition per row — the sweeps
 * never write status directly (rule 2). Per-row failures are isolated so one
 * bad row never aborts the batch. Pure functions of `now` for testability.
 */
import { BookingMode, BookingStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

import { checkIn, complete, expire } from "./transitions";

const HOUR_MS = 60 * 60 * 1000;
/** Auto check-in at 15:00 ICT = 08:00 UTC → due when checkIn ≤ now − 8h. */
export const CHECKIN_OFFSET_MS = 8 * HOUR_MS;
/** Auto checkout at 11:00 ICT = 04:00 UTC → due when checkOut ≤ now − 4h. */
export const CHECKOUT_OFFSET_MS = 4 * HOUR_MS;

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

/** REQUESTED past respondBy → EXPIRED, then notify the guest (§6 matrix). */
export async function sweepOverdueRequests(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.REQUESTED, respondBy: { lt: now } },
    select: { id: true, userId: true, listing: { select: { title: true } } },
  });
  let done = 0;
  for (const row of rows) {
    try {
      await expire(row.id, now);
      await notify(row.userId, "REQUEST_EXPIRED", { listingTitle: row.listing.title, bookingId: row.id });
      done++;
    } catch (err) {
      console.error(`[cron] expire request ${row.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}

/** AWAITING_PAYMENT past payBy → EXPIRED; for REQUEST-mode, notify the host (instant hosts never saw it). */
export async function sweepOverduePayments(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.AWAITING_PAYMENT, payBy: { lt: now } },
    select: { id: true, bookingMode: true, listing: { select: { hostId: true, title: true } } },
  });
  let done = 0;
  for (const row of rows) {
    try {
      await expire(row.id, now);
      if (row.bookingMode === BookingMode.REQUEST) {
        await notify(row.listing.hostId, "PAYMENT_EXPIRED_HOST", { listingTitle: row.listing.title, bookingId: row.id });
      }
      done++;
    } catch (err) {
      console.error(`[cron] expire payment ${row.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}

const PAY_REMINDER_LEAD_MS = 2 * HOUR_MS;

/**
 * AWAITING_PAYMENT with payBy within the next 2h and not yet reminded → nudge the
 * guest once (§6 "payment 2h left"). The CAS update on payReminderSentAt makes the
 * send fire exactly once even if two ticks overlap (count 0 = already claimed).
 */
export async function sweepPaymentReminders(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: {
      status: BookingStatus.AWAITING_PAYMENT,
      payReminderSentAt: null,
      payBy: { gt: now, lte: new Date(now.getTime() + PAY_REMINDER_LEAD_MS) },
    },
    select: { id: true, userId: true, listing: { select: { title: true } } },
  });
  let done = 0;
  for (const row of rows) {
    try {
      const claim = await prisma.booking.updateMany({
        where: { id: row.id, payReminderSentAt: null },
        data: { payReminderSentAt: now },
      });
      if (claim.count === 0) continue; // another tick already sent it
      await notify(row.userId, "PAYMENT_REMINDER_GUEST", { listingTitle: row.listing.title, bookingId: row.id });
      done++;
    } catch (err) {
      console.error(`[cron] pay reminder ${row.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}

/** CONFIRMED whose check-in time (15:00 ICT) has arrived → CHECKED_IN. */
export async function sweepDueCheckIns(now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - CHECKIN_OFFSET_MS);
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.CONFIRMED, checkIn: { lte: threshold } },
    select: { id: true },
  });
  return forEachRow(
    rows.map((r) => r.id),
    (id) => checkIn(id),
  );
}

/** CHECKED_IN whose checkout time (11:00 ICT) has arrived → COMPLETED (releases escrow). */
export async function sweepDueCheckouts(now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - CHECKOUT_OFFSET_MS);
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.CHECKED_IN, checkOut: { lte: threshold } },
    select: { id: true },
  });
  return forEachRow(
    rows.map((r) => r.id),
    (id) => complete(id),
  );
}
