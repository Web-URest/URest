"use server";

import { BookingStatus, PaymentMethod, PaymentStatus } from "@prisma/client";

import { AuthError, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { createChargeForBooking, PaymentError } from "@/lib/payments/charge";
import { OpnError, retrieveCharge } from "@/lib/payments/opn";

import { qrUrlFromCharge } from "./helpers";

export type PayResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Owner check only — the caller may be any status (the poller needs to see CONFIRMED/EXPIRED). */
async function ownerStatus(bookingId: string): Promise<PayResult<{ status: BookingStatus }>> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: "errorUnauthenticated" };
    throw err;
  }
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { userId: true, status: true } });
  if (!b || b.userId !== userId) return { ok: false, error: "errorNotFound" };
  return { ok: true, status: b.status };
}

/** Owner + must be AWAITING_PAYMENT (the charge actions). */
async function guardAwaiting(bookingId: string): Promise<PayResult> {
  const owned = await ownerStatus(bookingId);
  if (!owned.ok) return owned;
  if (owned.status !== BookingStatus.AWAITING_PAYMENT) return { ok: false, error: "errorWrongState" };
  return { ok: true };
}

function mapPayError(err: unknown): { ok: false; error: string } {
  if (err instanceof PaymentError) {
    return { ok: false, error: err.reason === "NOT_AWAITING_PAYMENT" ? "errorWrongState" : "errorPaymentFailed" };
  }
  if (err instanceof OpnError) return { ok: false, error: "errorPaymentFailed" };
  throw err; // unexpected (DB, etc.) — let it surface as a 500
}

/**
 * Get a PromptPay QR for this booking: reuse a still-valid PENDING charge, else open
 * a fresh one. `regenerate` forces a new charge (QR expired) without touching payBy.
 */
export async function getPromptPayCharge(
  bookingId: string,
  opts: { regenerate?: boolean } = {},
): Promise<PayResult<{ qrUrl: string; qrExpiresAt: string | null }>> {
  const guard = await guardAwaiting(bookingId);
  if (!guard.ok) return guard;

  try {
    if (!opts.regenerate) {
      const existing = await prisma.payment.findFirst({
        where: {
          bookingId,
          method: PaymentMethod.PROMPTPAY,
          status: PaymentStatus.PENDING,
          qrExpiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const charge = await retrieveCharge(existing.opnChargeId);
        const qrUrl = qrUrlFromCharge(charge);
        if (qrUrl) return { ok: true, qrUrl, qrExpiresAt: existing.qrExpiresAt?.toISOString() ?? null };
      }
    }
    const { payment, charge } = await createChargeForBooking(bookingId, PaymentMethod.PROMPTPAY);
    const qrUrl = qrUrlFromCharge(charge);
    if (!qrUrl) return { ok: false, error: "errorPaymentFailed" };
    return { ok: true, qrUrl, qrExpiresAt: payment.qrExpiresAt?.toISOString() ?? null };
  } catch (err) {
    return mapPayError(err);
  }
}

/** Charge a tokenized card. Returns the 3DS `authorizeUri` when authorization is required. */
export async function payWithCard(
  bookingId: string,
  token: string,
  returnUri: string,
): Promise<PayResult<{ authorizeUri?: string }>> {
  const guard = await guardAwaiting(bookingId);
  if (!guard.ok) return guard;
  try {
    const { charge } = await createChargeForBooking(bookingId, PaymentMethod.CARD, { cardToken: token, returnUri });
    return charge.authorize_uri ? { ok: true, authorizeUri: charge.authorize_uri } : { ok: true };
  } catch (err) {
    return mapPayError(err);
  }
}

/** Lightweight status read for the pay-screen poller. */
export async function getBookingPaymentStatus(bookingId: string): Promise<PayResult<{ status: BookingStatus }>> {
  return ownerStatus(bookingId);
}
