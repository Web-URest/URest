"use server";

import { requireHostEligible, requireUser } from "@/lib/auth/guards";
import { accept, BookingError, cancelByGuest, decline } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function guestAndTitle(bookingId: string): Promise<{ guestId: string | null; listingTitle: string }> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { listing: { select: { title: true } } },
  });
  return { guestId: b?.userId ?? null, listingTitle: b?.listing.title ?? "" };
}

function mapErr(err: unknown): ActionResult {
  if (err instanceof BookingError) {
    return {
      ok: false,
      error: err.reason === "NOT_HOST" || err.reason === "NOT_GUEST" ? "errorNotOwner" : "errorWrongState",
    };
  }
  throw err;
}

/** REQUESTED → AWAITING_PAYMENT; notify the guest to pay. */
export async function acceptRequest(bookingId: string): Promise<ActionResult> {
  try {
    const host = await requireHostEligible();
    await accept(bookingId, host.id, new Date());
    const { guestId, listingTitle } = await guestAndTitle(bookingId);
    if (guestId) await notify(guestId, "REQUEST_ACCEPTED", { listingTitle, bookingId });
    return { ok: true };
  } catch (err) {
    return mapErr(err);
  }
}

/** REQUESTED → DECLINED; notify the guest. */
export async function declineRequest(bookingId: string): Promise<ActionResult> {
  try {
    const host = await requireHostEligible();
    await decline(bookingId, host.id);
    const { guestId, listingTitle } = await guestAndTitle(bookingId);
    if (guestId) await notify(guestId, "REQUEST_DECLINED", { listingTitle, bookingId });
    return { ok: true };
  } catch (err) {
    return mapErr(err);
  }
}

/** Guest withdraws a pre-payment request. */
export async function withdrawRequest(bookingId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await cancelByGuest(bookingId, user.id, new Date());
    return { ok: true };
  } catch (err) {
    return mapErr(err);
  }
}
