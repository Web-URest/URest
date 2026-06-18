/**
 * Report creation (PRODUCT_FLOWS §3.8/§4.5, issue #27). The ONLY place `Report`
 * rows are written. Reports are polymorphic — these creators set exactly one
 * target (a booking or a listing), satisfying the num_nonnulls=1 CHECK with a
 * friendly app-level guard first. Status starts RECEIVED; the reporter gets an
 * ack notification (the start of the §3.8 status trail).
 *
 * Listing reports allow a logged-out reporter (reporterId null) — guests are the
 * fraud sensors and the heart on a scam listing must work before signup.
 */
import type { ReportCategory } from "@prisma/client";

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

export type ReportErrorReason = "NOT_FOUND" | "NOT_RELATED" | "EMPTY_TEXT";

export class ReportError extends Error {
  constructor(public readonly reason: ReportErrorReason) {
    super(reason);
    this.name = "ReportError";
  }
}

function requireText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new ReportError("EMPTY_TEXT");
  return trimmed;
}

/**
 * Report a problem with a booking (§3.8 guest "รายงานปัญหาการจอง" / §4.5 host).
 * The reporter must be a party to the booking — its guest or the listing's host.
 */
export async function createBookingReport(
  reporterId: string,
  bookingId: string,
  category: ReportCategory,
  text: string,
): Promise<string> {
  const body = requireText(text);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { listing: { select: { hostId: true, title: true } } },
  });
  if (!booking) throw new ReportError("NOT_FOUND");
  if (booking.userId !== reporterId && booking.listing.hostId !== reporterId) {
    throw new ReportError("NOT_RELATED");
  }

  const report = await prisma.report.create({
    data: { reporterId, bookingId, category, text: body, photoKeys: [] },
  });

  await notify(reporterId, "REPORT_RECEIVED", {
    category,
    targetLabel: booking.listing.title,
  });
  return report.id;
}

/**
 * Report a listing (§3.8 "รายงานที่พักนี้"). reporterId may be null (logged-out).
 */
export async function createListingReport(
  reporterId: string | null,
  listingId: string,
  category: ReportCategory,
  text: string,
): Promise<string> {
  const body = requireText(text);
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { title: true },
  });
  if (!listing) throw new ReportError("NOT_FOUND");

  const report = await prisma.report.create({
    data: { reporterId, listingId, category, text: body, photoKeys: [] },
  });

  if (reporterId) {
    await notify(reporterId, "REPORT_RECEIVED", { category, targetLabel: listing.title });
  }
  return report.id;
}
