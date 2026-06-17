"use server";

import { Prisma } from "@prisma/client";

import { AuthError, requirePhoneVerified } from "@/lib/auth/guards";
import { request } from "@/lib/booking/transitions";
import { getListingDetail } from "@/lib/listing/queries";
import { notify } from "@/lib/notifications";
import { buildQuote } from "@/lib/pricing/quote";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface RequestInput {
  listingId: string;
  checkIn: string; // 'YYYY-MM-DD'
  checkOut: string; // exclusive
  guests: number;
  note: string;
}

/**
 * Guest sends a request-to-book (PRODUCT_FLOWS §3.2 step 1). Ladder-gated
 * (logged-in + phone-verified). Snapshots the quote via the SAME loader the
 * listing page uses, so the price the guest committed to is exactly what they
 * saw (ADR-011). Creates a REQUESTED booking and notifies the host.
 */
export async function createBookingRequest(
  input: RequestInput,
): Promise<ActionResult<{ bookingId: string }>> {
  let user: Awaited<ReturnType<typeof requirePhoneVerified>>;
  try {
    user = await requirePhoneVerified();
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: err.reason === "PHONE_UNVERIFIED" ? "errorPhoneUnverified" : "errorUnauthenticated" };
    }
    throw err;
  }

  const detail = await getListingDetail(input.listingId);
  if (!detail || detail.listing.bookingMode !== "REQUEST") {
    return { ok: false, error: "errorUnavailable" };
  }
  const { listing, holidaySet } = detail;

  const quote = buildQuote({
    config: {
      baseWeekdaySatang: listing.baseWeekdaySatang,
      baseWeekendSatang: listing.baseWeekendSatang,
      holidaySatang: listing.holidaySatang,
      includedGuests: listing.includedGuests,
      extraGuestFeeSatang: listing.extraGuestFeeSatang,
    },
    seasons: listing.seasons.map((s) => ({
      startDate: s.startDate.toISOString().slice(0, 10),
      endDate: s.endDate.toISOString().slice(0, 10),
      weekdaySatang: s.weekdaySatang,
      weekendSatang: s.weekendSatang,
      nameTh: s.nameTh,
    })),
    holidays: holidaySet,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
  });

  let booking: Awaited<ReturnType<typeof request>>;
  try {
    booking = await request(
      {
        listingId: listing.id,
        userId: user.id,
        checkIn: new Date(input.checkIn),
        checkOut: new Date(input.checkOut),
        priceLines: quote.nights as unknown as Prisma.InputJsonValue,
        totalSatang: quote.totalSatang,
        commissionSatang: quote.commissionSatang,
        cancellationTier: listing.cancellationTier,
        // Listing has structured house rules (partyPolicy/quietHours/…), not a
        // text blob; the guest's acceptance is the checkbox gate. A rendered
        // rules-text snapshot can populate this later.
        houseRulesText: null,
        guestNoteToHost: input.note || null,
      },
      new Date(),
    );
  } catch (err) {
    // The ONLY expected failure here is the double-booking GiST exclusion
    // (Postgres 23P01 on `booking_no_double_booking`) → friendly "dates taken".
    // Match by code/constraint so an unrelated DB fault isn't mislabeled, and
    // so the exclusion is caught regardless of which Prisma error class wraps
    // it. Anything else is a real fault → propagate (→ generic 500).
    if (isDoubleBookingError(err)) {
      return { ok: false, error: "errorDatesTaken" };
    }
    throw err;
  }

  // notify is fire-and-forget (never throws — see lib/notifications); kept out
  // of the create try so a notification path can't be mistaken for "dates taken".
  await notify(listing.hostId, "BOOKING_REQUESTED", {
    listingTitle: listing.title,
    guestName: user.displayName,
    bookingId: booking.id,
  });
  return { ok: true, bookingId: booking.id };
}

/** True only for the booking double-booking exclusion-constraint violation. */
function isDoubleBookingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : "";
  return (
    msg.includes("booking_no_double_booking") ||
    msg.includes("23P01") ||
    msg.toLowerCase().includes("exclusion constraint")
  );
}
