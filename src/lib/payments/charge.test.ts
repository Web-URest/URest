import { BookingStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findUnique: vi.fn() },
    payment: { create: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("./opn", () => ({
  createPromptPayCharge: vi.fn(),
  createCardCharge: vi.fn(),
  retrieveCharge: vi.fn(),
}));

// Keep the real BookingError (for instanceof) but stub the transition itself.
vi.mock("@/lib/booking/transitions", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/booking/transitions")>();
  return { ...actual, confirmFromWebhook: vi.fn() };
});

import { BookingError, confirmFromWebhook } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";

import { applyChargeEvent, createChargeForBooking, PaymentError } from "./charge";
import { createCardCharge, createPromptPayCharge, retrieveCharge } from "./opn";

const findBooking = prisma.booking.findUnique as unknown as Mock;
const paymentCreate = prisma.payment.create as unknown as Mock;
const paymentUpdateMany = prisma.payment.updateMany as unknown as Mock;
const ppCharge = createPromptPayCharge as unknown as Mock;
const cardCharge = createCardCharge as unknown as Mock;
const fetchCharge = retrieveCharge as unknown as Mock;
const confirm = confirmFromWebhook as unknown as Mock;

const NOW = new Date("2026-06-17T12:00:00.000Z");

function booking(over: Record<string, unknown> = {}) {
  return { id: "bk1", status: BookingStatus.AWAITING_PAYMENT, totalSatang: 12_900_00, ...over };
}

function charge(over: Record<string, unknown> = {}) {
  return {
    object: "charge",
    id: "chrg_1",
    status: "successful",
    paid: true,
    amount: 12_900_00,
    currency: "thb",
    metadata: { bookingId: "bk1" },
    expires_at: "2026-06-17T12:15:00.000Z",
    source: { type: "promptpay", scannable_code: { image: { download_uri: "https://x/qr.png" } } },
    ...over,
  };
}

beforeEach(() => {
  paymentCreate.mockResolvedValue({ id: "pay_1" });
  paymentUpdateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.clearAllMocks());

describe("createChargeForBooking", () => {
  it("creates a PromptPay charge and writes a PENDING Payment row with the QR expiry", async () => {
    findBooking.mockResolvedValue(booking());
    ppCharge.mockResolvedValue(charge({ status: "pending", paid: false }));

    await createChargeForBooking("bk1", PaymentMethod.PROMPTPAY);

    expect(ppCharge).toHaveBeenCalledWith({ amountSatang: 12_900_00, bookingId: "bk1" });
    expect(paymentCreate).toHaveBeenCalledWith({
      data: {
        bookingId: "bk1",
        opnChargeId: "chrg_1",
        method: PaymentMethod.PROMPTPAY,
        amountSatang: 12_900_00,
        status: PaymentStatus.PENDING,
        qrExpiresAt: new Date("2026-06-17T12:15:00.000Z"),
      },
    });
  });

  it("rejects a booking that isn't awaiting payment (no charge, no Payment row)", async () => {
    findBooking.mockResolvedValue(booking({ status: BookingStatus.CONFIRMED }));

    const err = await createChargeForBooking("bk1", PaymentMethod.PROMPTPAY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect(err).toMatchObject({ reason: "NOT_AWAITING_PAYMENT" });
    expect(ppCharge).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("rejects when the booking doesn't exist", async () => {
    findBooking.mockResolvedValue(null);
    await expect(createChargeForBooking("bkX", PaymentMethod.PROMPTPAY)).rejects.toMatchObject({
      reason: "BOOKING_NOT_FOUND",
    });
  });

  it("creates a card charge from the supplied token", async () => {
    findBooking.mockResolvedValue(booking());
    cardCharge.mockResolvedValue(charge({ id: "chrg_card", source: null, expires_at: null }));

    await createChargeForBooking("bk1", PaymentMethod.CARD, { cardToken: "tokn_9" });

    expect(cardCharge).toHaveBeenCalledWith({ amountSatang: 12_900_00, bookingId: "bk1", token: "tokn_9" });
    expect(paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        method: PaymentMethod.CARD,
        opnChargeId: "chrg_card",
        qrExpiresAt: null,
      }),
    });
  });

  it("rejects a card charge with no token", async () => {
    findBooking.mockResolvedValue(booking());
    await expect(createChargeForBooking("bk1", PaymentMethod.CARD)).rejects.toMatchObject({
      reason: "CARD_TOKEN_REQUIRED",
    });
    expect(cardCharge).not.toHaveBeenCalled();
  });
});

describe("applyChargeEvent", () => {
  it("re-fetches the charge, confirms the booking, and marks the Payment SUCCESSFUL", async () => {
    fetchCharge.mockResolvedValue(charge({ status: "successful" }));
    confirm.mockResolvedValue(booking({ status: BookingStatus.CONFIRMED }));

    const result = await applyChargeEvent("evnt_1", "chrg_1", { id: "evnt_1" }, NOW);

    expect(fetchCharge).toHaveBeenCalledWith("chrg_1"); // re-fetch IS the verification
    expect(confirm).toHaveBeenCalledWith(
      { bookingId: "bk1", opnEventId: "evnt_1", payload: { id: "evnt_1" } },
      NOW,
    );
    expect(paymentUpdateMany).toHaveBeenCalledWith({
      where: { opnChargeId: "chrg_1" },
      data: { status: PaymentStatus.SUCCESSFUL },
    });
    expect(result).toEqual({ kind: "confirmed", bookingId: "bk1" });
  });

  it("ignores a duplicate/late event when the booking is no longer awaiting payment", async () => {
    // confirmFromWebhook's own claim-based replay no-op is proven in booking/transitions.test
    // + ledger/apply.test; here we prove the orchestrator swallows the resulting BookingError.
    fetchCharge.mockResolvedValue(charge({ status: "successful" }));
    confirm.mockRejectedValue(new BookingError("WRONG_STATE"));

    const result = await applyChargeEvent("evnt_2", "chrg_1", {}, NOW);

    expect(result).toEqual({ kind: "ignored", bookingId: "bk1" });
    expect(paymentUpdateMany).not.toHaveBeenCalled();
  });

  it("marks the Payment FAILED on a failed charge without touching the booking", async () => {
    fetchCharge.mockResolvedValue(charge({ status: "failed", paid: false }));

    const result = await applyChargeEvent("evnt_3", "chrg_1", {}, NOW);

    expect(confirm).not.toHaveBeenCalled();
    expect(paymentUpdateMany).toHaveBeenCalledWith({
      where: { opnChargeId: "chrg_1" },
      data: { status: PaymentStatus.FAILED },
    });
    expect(result).toEqual({ kind: "failed", bookingId: "bk1" });
  });

  it("marks the Payment EXPIRED on an expired charge", async () => {
    fetchCharge.mockResolvedValue(charge({ status: "expired", paid: false }));

    const result = await applyChargeEvent("evnt_5", "chrg_1", {}, NOW);

    expect(paymentUpdateMany).toHaveBeenCalledWith({
      where: { opnChargeId: "chrg_1" },
      data: { status: PaymentStatus.EXPIRED },
    });
    expect(result).toEqual({ kind: "expired", bookingId: "bk1" });
  });

  it("ignores a charge with no booking reference (foreign / spoofed event)", async () => {
    fetchCharge.mockResolvedValue(charge({ metadata: {} }));

    const result = await applyChargeEvent("evnt_4", "chrg_x", {}, NOW);

    expect(confirm).not.toHaveBeenCalled();
    expect(paymentUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "ignored" });
  });
});
