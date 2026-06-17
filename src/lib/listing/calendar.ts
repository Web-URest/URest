/**
 * Host manual calendar blocks — ปิดเอง (PRODUCT_FLOWS §4.2 ปฏิทิน).
 *
 * The host blocks dates for legitimate unavailability (owner use, maintenance,
 * commitments predating onboarding) — NOT a "take bookings elsewhere" affordance
 * (ADR-012 §4). Ownership is re-checked on every write.
 *
 * Booking-vs-block conflict checks (a paid U-Rest guest already on those dates)
 * are Phase 3 — the `Booking` model + its GiST exclusion land then. This module
 * only owns the host's own blocks.
 */

import type { CalendarBlock } from "@prisma/client";

import { prisma } from "@/lib/db";

import { ListingError } from "./transitions";

/** Verify `hostId` owns `listingId`, or throw the precise reason. */
async function assertOwnsListing(listingId: string, hostId: string): Promise<void> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { hostId: true },
  });
  if (!listing) throw new ListingError("NOT_FOUND");
  if (listing.hostId !== hostId) throw new ListingError("NOT_OWNER");
}

/** Add a self-block over `[startDate, endDate]` (inclusive `@db.Date` range). */
export async function addCalendarBlock(
  listingId: string,
  hostId: string,
  startDate: Date,
  endDate: Date,
  note?: string,
): Promise<CalendarBlock> {
  await assertOwnsListing(listingId, hostId);
  return prisma.calendarBlock.create({
    data: { listingId, startDate, endDate, note: note ?? null },
  });
}

/** Remove a self-block, gated on the block's listing being owned by `hostId`. */
export async function removeCalendarBlock(
  blockId: string,
  hostId: string,
): Promise<void> {
  const block = await prisma.calendarBlock.findUnique({
    where: { id: blockId },
    select: { listing: { select: { hostId: true } } },
  });
  if (!block) throw new ListingError("NOT_FOUND");
  if (block.listing.hostId !== hostId) throw new ListingError("NOT_OWNER");
  await prisma.calendarBlock.delete({ where: { id: blockId } });
}

/**
 * Blocks for a listing's calendar window — everything ending on or after
 * `fromDate` (the host calendar shows the current month forward, §4.2).
 */
export async function getHostCalendar(
  listingId: string,
  hostId: string,
  fromDate: Date,
): Promise<CalendarBlock[]> {
  await assertOwnsListing(listingId, hostId);
  return prisma.calendarBlock.findMany({
    where: { listingId, endDate: { gte: fromDate } },
    orderBy: { startDate: "asc" },
  });
}
