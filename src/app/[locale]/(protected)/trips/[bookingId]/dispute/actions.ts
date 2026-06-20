"use server";

import type { ReportCategory } from "@prisma/client";

import { BookingError, appealDispute, openDispute } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { presignDisputePhotoUpload } from "@/lib/disputes/upload";
import { notify } from "@/lib/notifications";
import { createBookingReport } from "@/lib/reports/create";
import { requireUser } from "@/lib/auth/guards";

/**
 * Guest dispute server actions (#26, PRODUCT_FLOWS §5.3). `openDispute` runs FIRST
 * (its CHECKED_IN + guest gate + escrow freeze) so an evidence Report is never
 * orphaned by a failed gate; the category/detail/photos then ride a booking Report.
 * Appeals are side-aware and one-per-side (enforced in lib/booking).
 */

export type PresignResult = { ok: true; r2Key: string; uploadUrl: string } | { ok: false };

export async function presignDisputePhotoAction(
  bookingId: string,
  file: { byteLength: number; contentType: string },
): Promise<PresignResult> {
  const user = await requireUser();
  try {
    const { r2Key, uploadUrl } = await presignDisputePhotoUpload(
      { bookingId, byteLength: file.byteLength, contentType: file.contentType },
      user.id,
    );
    return { ok: true, r2Key, uploadUrl };
  } catch {
    return { ok: false };
  }
}

export interface OpenDisputeArgs {
  bookingId: string;
  category: ReportCategory;
  text: string;
  photoKeys: string[];
}

export type DisputeResult = { ok: true } | { ok: false; reason: string };

export async function openDisputeAction(input: OpenDisputeArgs): Promise<DisputeResult> {
  const user = await requireUser();
  if (!input.text.trim()) return { ok: false, reason: "EMPTY_TEXT" };

  try {
    // FIRST — gate (guest + CHECKED_IN) + auto-FROZEN escrow (§5.3).
    await openDispute(input.bookingId, user.id);
  } catch (e) {
    return { ok: false, reason: e instanceof BookingError ? e.reason : "UNKNOWN" };
  }

  // Dispute is open — record the evidence (category/detail/photos) as a booking Report.
  await createBookingReport(user.id, input.bookingId, input.category, input.text, input.photoKeys);

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { code: true, listing: { select: { title: true, hostId: true } } },
  });
  if (booking) {
    await notify(user.id, "DISPUTE_OPENED_GUEST", { listingTitle: booking.listing.title });
    await notify(booking.listing.hostId, "DISPUTE_OPENED_HOST", {
      listingTitle: booking.listing.title,
      code: booking.code,
    });
  }
  return { ok: true };
}

/** Appeal a resolved dispute once (§5.3). Side is derived from the acting party. */
export async function appealDisputeAction(bookingId: string): Promise<DisputeResult> {
  const user = await requireUser();
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, listing: { select: { hostId: true } } },
  });
  if (!booking) return { ok: false, reason: "NOT_FOUND" };
  const side: "GUEST" | "HOST" | null =
    user.id === booking.userId ? "GUEST" : user.id === booking.listing.hostId ? "HOST" : null;
  if (!side) return { ok: false, reason: "NOT_PARTICIPANT" };

  try {
    await appealDispute(bookingId, user.id, side, new Date());
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof BookingError ? e.reason : "UNKNOWN" };
  }
}
