/**
 * Booking-code issuance (PRODUCT_FLOWS §2.1): codes are minted at CONFIRMED as
 * `UR-YYMM-NNNN`, gap-free per calendar month. The counter lives in
 * `BookingCodeCounter`; the increment is an atomic upsert so concurrent
 * confirmations can't collide on a number. Must run inside the confirm
 * transaction (lib/booking) so the code and the CONFIRMED status commit together.
 */

import type { Prisma } from "@prisma/client";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Year-month key for `at`, in Asia/Bangkok (the code reads in Thai local time
 * even though the DB stores UTC — rule 3). June 2026 → "2606".
 */
export function yearMonthKey(at: Date): string {
  const bkk = new Date(at.getTime() + BANGKOK_OFFSET_MS);
  const yy = String(bkk.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(bkk.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

export function formatBookingCode(yearMonth: string, counter: number): string {
  return `UR-${yearMonth}-${String(counter).padStart(4, "0")}`;
}

/**
 * Mint the next code for `at`'s month. Atomic INSERT … ON CONFLICT … RETURNING
 * is the race-safe equivalent of SELECT … FOR UPDATE here — the row is created
 * or its counter bumped in one statement, returning the new value.
 */
export async function issueBookingCode(tx: Prisma.TransactionClient, at: Date): Promise<string> {
  const yearMonth = yearMonthKey(at);
  const rows = await tx.$queryRaw<{ counter: number }[]>`
    INSERT INTO "BookingCodeCounter" ("yearMonth", "counter")
    VALUES (${yearMonth}, 1)
    ON CONFLICT ("yearMonth")
    DO UPDATE SET "counter" = "BookingCodeCounter"."counter" + 1
    RETURNING "counter"
  `;
  const counter = rows[0]?.counter;
  if (counter === undefined) {
    throw new Error(`BookingCodeCounter upsert returned no row for ${yearMonth}`);
  }
  return formatBookingCode(yearMonth, counter);
}
