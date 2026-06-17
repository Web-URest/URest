"use server";

import { Prisma } from "@prisma/client";

import { AuthError, requirePhoneVerified } from "@/lib/auth/guards";
import { instantHold } from "@/lib/booking/transitions";
import { getListingDetail } from "@/lib/listing/queries";
import { buildQuote } from "@/lib/pricing/quote";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface InstantInput {
  listingId: string;
  checkIn: string; // 'YYYY-MM-DD'
  checkOut: string; // exclusive
  guests: number;
}

/**
 * Guest instant-books (PRODUCT_FLOWS §3.2 instant mode). Ladder-gated
 * (logged-in + phone-verified). Snapshots the quote via the SAME loader the
 * listing page uses (ADR-011), then `instantHold` creates an AWAITING_PAYMENT
 * booking with a 1h pay window — no host approval, so no host notification. The
 * guest is routed straight to the payment screen.
 */
export async function createInstantBooking(
  input: InstantInput,
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
  if (!detail || detail.listing.bookingMode !== "INSTANT") {
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

  let booking: Awaited<ReturnType<typeof instantHold>>;
  try {
    booking = await instantHold(
      {
        listingId: listing.id,
        userId: user.id,
        checkIn: new Date(input.checkIn),
        checkOut: new Date(input.checkOut),
        priceLines: quote.nights as unknown as Prisma.InputJsonValue,
        totalSatang: quote.totalSatang,
        commissionSatang: quote.commissionSatang,
        cancellationTier: listing.cancellationTier,
        // Structured house rules (partyPolicy/quietHours/…); the checkbox is the gate.
        houseRulesText: null,
      },
      new Date(),
    );
  } catch (err) {
    // A concurrent hold for the same dates trips the double-booking GiST exclusion
    // (Postgres 23P01 on `booking_no_double_booking`) → friendly "dates taken".
    // Anything else is a real fault → propagate (→ generic 500).
    if (isDoubleBookingError(err)) {
      return { ok: false, error: "errorDatesTaken" };
    }
    throw err;
  }

  // No host notification — instant mode has no approval step (§3.2). The guest
  // is sent straight to the payment screen by the caller.
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
