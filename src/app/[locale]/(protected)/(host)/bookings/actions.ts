"use server";

import { requireHostEligible } from "@/lib/auth/guards";
import { BookingError, cancelByHost } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { refundBookingToGuest } from "@/lib/payments/charge";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Host cancels a CONFIRMED booking (PRODUCT_FLOWS §3.6, ADR-012 §2). The transition
 * refunds the guest 100% (HELD→REVERSED) and records a strike (3 → suspension) in its
 * own DB tx; then we move the refund to Opn (best-effort) and notify the guest with the
 * amount. The strike asymmetry is deliberate — host cancellations are a top trust killer.
 */
export async function cancelBookingByHost(bookingId: string): Promise<ActionResult> {
  try {
    const host = await requireHostEligible();
    await cancelByHost(bookingId, host.id, new Date());
  } catch (err) {
    if (err instanceof BookingError) {
      return { ok: false, error: err.reason === "NOT_HOST" ? "errorNotOwner" : "errorWrongState" };
    }
    throw err;
  }

  await refundBookingToGuest(bookingId); // 100% refund, best-effort (never throws)

  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, totalSatang: true, listing: { select: { title: true } } },
  });
  if (b) {
    await notify(b.userId, "BOOKING_CANCELLED_BY_HOST", {
      listingTitle: b.listing.title,
      refundSatang: b.totalSatang,
      bookingId,
    });
  }

  return { ok: true };
}
