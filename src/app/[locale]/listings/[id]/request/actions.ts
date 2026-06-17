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
  let userId: string;
  try {
    const user = await requirePhoneVerified();
    userId = user.id;
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

  try {
    const booking = await request(
      {
        listingId: listing.id,
        userId,
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
    await notify(listing.hostId, "BOOKING_REQUESTED", {
      listingTitle: listing.title,
      bookingId: booking.id,
    });
    return { ok: true, bookingId: booking.id };
  } catch (err) {
    // The booking double-booking GiST exclusion surfaces as a known DB error.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, error: "errorDatesTaken" };
    }
    throw err;
  }
}
