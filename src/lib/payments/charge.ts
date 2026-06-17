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

import { createCardCharge, createPromptPayCharge, retrieveCharge, type OpnCharge } from "./opn";

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
    try {
      await confirmFromWebhook({ bookingId, opnEventId, payload }, now);
    } catch (err) {
      if (err instanceof BookingError) return { kind: "ignored", bookingId };
      throw err;
    }
    await markPayment(chargeId, PaymentStatus.SUCCESSFUL);
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
