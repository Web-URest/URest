/**
 * Payments domain (issue #20). The only module that writes the `Payment` row,
 * and the bridge between the Opn gateway and the booking/escrow state machine.
 *
 * - `createChargeForBooking` opens an Opn charge for a booking awaiting payment.
 * - `applyChargeEvent` is the webhook handler's brain: it RE-FETCHES the charge
 *   from Opn (the verification — we never trust the webhook payload) and, on a
 *   successful charge, delegates to `confirmFromWebhook` (lib/booking) which
 *   atomically claims the event, confirms the booking, and moves escrow NONE→HELD
 *   (rule 6). The trailing Payment status update is idempotent.
 */
import { BookingStatus, PaymentMethod, PaymentStatus, type Payment, type Prisma } from "@prisma/client";

import { BookingError, confirmFromWebhook } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

import { createCardCharge, createPromptPayCharge, refundCharge, retrieveCharge, type OpnCharge } from "./opn";

export type PaymentErrorReason = "BOOKING_NOT_FOUND" | "NOT_AWAITING_PAYMENT" | "CARD_TOKEN_REQUIRED";

export class PaymentError extends Error {
  constructor(public readonly reason: PaymentErrorReason) {
    super(reason);
    this.name = "PaymentError";
  }
}

/**
 * Open an Opn charge for a booking awaiting payment and record a PENDING Payment
 * row. A regenerated PromptPay QR is a fresh charge → a fresh row (schema note).
 */
export async function createChargeForBooking(
  bookingId: string,
  method: PaymentMethod,
  opts: { cardToken?: string; returnUri?: string } = {},
): Promise<{ payment: Payment; charge: OpnCharge }> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new PaymentError("BOOKING_NOT_FOUND");
  if (booking.status !== BookingStatus.AWAITING_PAYMENT) {
    throw new PaymentError("NOT_AWAITING_PAYMENT");
  }

  let charge: OpnCharge;
  if (method === PaymentMethod.CARD) {
    if (!opts.cardToken || !opts.returnUri) throw new PaymentError("CARD_TOKEN_REQUIRED");
    charge = await createCardCharge({
      amountSatang: booking.totalSatang,
      bookingId,
      token: opts.cardToken,
      returnUri: opts.returnUri,
    });
  } else {
    charge = await createPromptPayCharge({ amountSatang: booking.totalSatang, bookingId });
  }

  const payment = await prisma.payment.create({
    data: {
      bookingId,
      opnChargeId: charge.id,
      method,
      amountSatang: booking.totalSatang,
      status: PaymentStatus.PENDING,
      qrExpiresAt: charge.expires_at ? new Date(charge.expires_at) : null,
    },
  });

  return { payment, charge };
}

/** The outcome of processing one Opn webhook event (the route maps these to HTTP). */
export type ChargeEventOutcome =
  | { kind: "confirmed"; bookingId: string }
  | { kind: "refunded"; bookingId: string }
  | { kind: "failed"; bookingId: string }
  | { kind: "expired"; bookingId: string }
  | { kind: "ignored"; bookingId?: string };

/**
 * Process an Opn charge webhook event. Re-fetches the charge (verification), then
 * acts on its AUTHORITATIVE status. Idempotent: the booking/escrow move is guarded
 * by `confirmFromWebhook`'s event claim (replay no-op proven in booking/ledger
 * tests); the Payment update is a terminal-status write. A late/duplicate event
 * for an already-progressed booking surfaces as a swallowed `BookingError` →
 * `ignored`. Unexpected errors (DB, Opn network) propagate so the route returns
 * 500 and Opn retries.
 */
export async function applyChargeEvent(
  opnEventId: string,
  chargeId: string,
  payload: Prisma.InputJsonValue,
  now: Date,
): Promise<ChargeEventOutcome> {
  const charge = await retrieveCharge(chargeId);
  const bookingId =
    typeof charge.metadata.bookingId === "string" ? charge.metadata.bookingId : null;
  if (!bookingId) return { kind: "ignored" }; // not ours / no booking reference

  if (charge.status === "successful") {
    let freshlyConfirmed = false;
    try {
      ({ freshlyConfirmed } = await confirmFromWebhook({ bookingId, opnEventId, payload }, now));
    } catch (err) {
      if (err instanceof BookingError) {
        // Paid-race (§3.2): a successful charge whose booking is no longer
        // AWAITING_PAYMENT (the 1h window expired just before this webhook, or the
        // booking already settled) — the guest is charged for something we can't
        // honor, so refund. NOT_FOUND = an unaccountable charge → leave for admin
        // reconciliation rather than auto-refunding blind.
        if (err.reason === "WRONG_STATE") return refundStrandedCharge(chargeId, charge.amount, bookingId);
        return { kind: "ignored", bookingId };
      }
      throw err;
    }
    await markPayment(chargeId, PaymentStatus.SUCCESSFUL);
    if (freshlyConfirmed) await notifyPaymentReceived(bookingId);
    return { kind: "confirmed", bookingId };
  }

  if (charge.status === "failed") {
    await markPayment(chargeId, PaymentStatus.FAILED);
    return { kind: "failed", bookingId };
  }

  if (charge.status === "expired") {
    await markPayment(chargeId, PaymentStatus.EXPIRED);
    return { kind: "expired", bookingId };
  }

  return { kind: "ignored", bookingId }; // pending / reversed — nothing to do
}

/** Idempotent terminal-status write keyed on the unique Opn charge id. */
function markPayment(opnChargeId: string, status: PaymentStatus): Promise<unknown> {
  return prisma.payment.updateMany({ where: { opnChargeId }, data: { status } });
}

/** Notify guest (receipt) + host (prep notice) once a payment confirms (§6). Best-effort — notify never throws. */
async function notifyPaymentReceived(bookingId: string): Promise<void> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, code: true, listing: { select: { hostId: true, title: true } } },
  });
  if (!b) return;
  const params = { listingTitle: b.listing.title, code: b.code ?? "", bookingId };
  await notify(b.userId, "PAYMENT_RECEIVED_GUEST", params);
  await notify(b.listing.hostId, "PAYMENT_RECEIVED_HOST", params);
}

/**
 * Paid-race fallback (§3.2): a charge succeeded but the booking already expired, so
 * the guest is charged with no booking → refund the full charge. The Payment-status
 * CAS makes this fire exactly once across webhook re-deliveries (count 0 = already
 * refunded). If the Opn refund call fails we roll the claim back to PENDING and
 * rethrow, so the webhook retry re-attempts — we never leave a charge marked REFUNDED
 * that wasn't actually refunded, and the guest is only notified once it truly is.
 */
async function refundStrandedCharge(
  chargeId: string,
  amountSatang: number,
  bookingId: string,
): Promise<ChargeEventOutcome> {
  const claim = await prisma.payment.updateMany({
    where: { opnChargeId: chargeId, status: PaymentStatus.PENDING },
    data: { status: PaymentStatus.REFUNDED },
  });
  if (claim.count === 0) return { kind: "refunded", bookingId }; // already refunded by an earlier delivery

  try {
    await refundCharge(chargeId, amountSatang);
  } catch (err) {
    await prisma.payment.updateMany({
      where: { opnChargeId: chargeId, status: PaymentStatus.REFUNDED },
      data: { status: PaymentStatus.PENDING },
    });
    throw err; // → 500, Opn retries, the next delivery re-claims and re-attempts
  }

  await notifyPaymentRefunded(bookingId);
  return { kind: "refunded", bookingId };
}

/** Tell the guest their paid-race charge was refunded in full (§6). Best-effort. */
async function notifyPaymentRefunded(bookingId: string): Promise<void> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, listing: { select: { title: true } } },
  });
  if (!b) return;
  await notify(b.userId, "PAYMENT_REFUNDED_GUEST", { listingTitle: b.listing.title, bookingId });
}

/**
 * Move the guest's refund to Opn after a cancellation settled the ledger (§3.6). The
 * Refund row (written inside `cancelByGuest`/`cancelByHost`) is the source of truth for
 * the amount; this only touches the gateway. Idempotent: skips if already refunded
 * (`opnRefundId` set) or nothing is refundable. Best-effort — on an Opn failure we log
 * and leave `opnRefundId` null so admin reconciliation (§5.2) catches the owed money;
 * we never throw, because the cancellation has already committed and must not be undone.
 */
export async function refundBookingToGuest(bookingId: string): Promise<void> {
  const refund = await prisma.refund.findUnique({ where: { bookingId } });
  if (!refund || refund.refundSatang <= 0 || refund.opnRefundId) return;

  const payment = await prisma.payment.findFirst({
    where: { bookingId, status: PaymentStatus.SUCCESSFUL },
  });
  if (!payment) {
    console.error(`[refund] no successful payment found for booking ${bookingId} — owed ${refund.refundSatang} satang`);
    return;
  }

  try {
    const opnRefund = await refundCharge(payment.opnChargeId, refund.refundSatang);
    await prisma.refund.update({ where: { bookingId }, data: { opnRefundId: opnRefund.id } });
  } catch (err) {
    console.error(`[refund] opn failed for booking ${bookingId}:`, err instanceof Error ? err.message : err);
    // opnRefundId stays null → owed-but-not-moved, surfaced in §5.2 reconciliation.
  }
}
