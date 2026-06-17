"use server";

import { AuthError, requireUser } from "@/lib/auth/guards";
import { BookingError, cancelByGuest } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { refundBookingToGuest } from "@/lib/payments/charge";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Guest cancels their own booking (PRODUCT_FLOWS §3.6). The transition settles the
 * ledger (tier refund → HELD→REVERSED) inside its own DB tx; then we move the refund
 * to Opn (best-effort) and notify the host. Used for CONFIRMED bookings — pre-payment
 * withdrawal stays on `withdrawRequest`.
 */
export async function cancelBookingByGuest(bookingId: string): Promise<ActionResult> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: "errorUnauthenticated" };
    throw err;
  }

  try {
    await cancelByGuest(bookingId, userId, new Date());
  } catch (err) {
    if (err instanceof BookingError) {
      return { ok: false, error: err.reason === "NOT_GUEST" ? "errorNotOwner" : "errorWrongState" };
    }
    throw err;
  }

  await refundBookingToGuest(bookingId); // best-effort Opn refund (never throws)

  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { listing: { select: { hostId: true, title: true } } },
  });
  if (b) await notify(b.listing.hostId, "BOOKING_CANCELLED_BY_GUEST", { listingTitle: b.listing.title, bookingId });

  return { ok: true };
}
