import { BookingStatus, PaymentMethod } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/auth/guards", () => {
  class AuthError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
      this.name = "AuthError";
    }
  }
  return { AuthError, requireUser: vi.fn() };
});
vi.mock("@/lib/db", () => ({ prisma: { booking: { findUnique: vi.fn() }, payment: { findFirst: vi.fn() } } }));
vi.mock("@/lib/payments/charge", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/payments/charge")>();
  return { ...actual, createChargeForBooking: vi.fn() };
});
vi.mock("@/lib/payments/opn", () => ({ retrieveCharge: vi.fn(), OpnError: class OpnError extends Error {} }));

import { AuthError, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { createChargeForBooking } from "@/lib/payments/charge";
import { retrieveCharge } from "@/lib/payments/opn";

import { getBookingPaymentStatus, getPromptPayCharge, payWithCard } from "./actions";

const guard = requireUser as unknown as Mock;
const findBooking = prisma.booking.findUnique as unknown as Mock;
const findPayment = prisma.payment.findFirst as unknown as Mock;
const makeCharge = createChargeForBooking as unknown as Mock;
const fetchCharge = retrieveCharge as unknown as Mock;

const QR = { source: { scannable_code: { image: { download_uri: "https://x/qr.png" } } } };

beforeEach(() => {
  guard.mockResolvedValue({ id: "g1" });
  findBooking.mockResolvedValue({ userId: "g1", status: BookingStatus.AWAITING_PAYMENT });
});
afterEach(() => vi.clearAllMocks());

describe("getPromptPayCharge", () => {
  it("reuses a valid PENDING PromptPay charge (no new charge created)", async () => {
    findPayment.mockResolvedValue({ opnChargeId: "chrg_old", qrExpiresAt: new Date("2026-06-17T12:15:00Z") });
    fetchCharge.mockResolvedValue(QR);

    const res = await getPromptPayCharge("bk1");

    expect(makeCharge).not.toHaveBeenCalled();
    expect(fetchCharge).toHaveBeenCalledWith("chrg_old");
    expect(res).toEqual({ ok: true, qrUrl: "https://x/qr.png", qrExpiresAt: "2026-06-17T12:15:00.000Z" });
  });

  it("creates a fresh charge when none is reusable", async () => {
    findPayment.mockResolvedValue(null);
    makeCharge.mockResolvedValue({ payment: { qrExpiresAt: new Date("2026-06-17T12:30:00Z") }, charge: QR });

    const res = await getPromptPayCharge("bk1");

    expect(makeCharge).toHaveBeenCalledWith("bk1", PaymentMethod.PROMPTPAY);
    expect(res).toEqual({ ok: true, qrUrl: "https://x/qr.png", qrExpiresAt: "2026-06-17T12:30:00.000Z" });
  });

  it("regenerate skips reuse and creates a new charge", async () => {
    makeCharge.mockResolvedValue({ payment: { qrExpiresAt: null }, charge: QR });
    await getPromptPayCharge("bk1", { regenerate: true });
    expect(findPayment).not.toHaveBeenCalled();
    expect(makeCharge).toHaveBeenCalled();
  });

  it("rejects when the booking isn't owned by the caller", async () => {
    findBooking.mockResolvedValue({ userId: "someone-else", status: BookingStatus.AWAITING_PAYMENT });
    expect(await getPromptPayCharge("bk1")).toEqual({ ok: false, error: "errorNotFound" });
  });

  it("rejects when the booking is no longer awaiting payment", async () => {
    findBooking.mockResolvedValue({ userId: "g1", status: BookingStatus.CONFIRMED });
    expect(await getPromptPayCharge("bk1")).toEqual({ ok: false, error: "errorWrongState" });
  });

  it("maps an unauthenticated guard to errorUnauthenticated", async () => {
    guard.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    expect(await getPromptPayCharge("bk1")).toEqual({ ok: false, error: "errorUnauthenticated" });
  });
});

describe("payWithCard", () => {
  it("returns the 3DS authorizeUri when the charge requires authorization", async () => {
    makeCharge.mockResolvedValue({ payment: {}, charge: { authorize_uri: "https://opn/3ds" } });
    const res = await payWithCard("bk1", "tokn_1", "https://app/th/trips/bk1/pay");
    expect(makeCharge).toHaveBeenCalledWith("bk1", PaymentMethod.CARD, { cardToken: "tokn_1", returnUri: "https://app/th/trips/bk1/pay" });
    expect(res).toEqual({ ok: true, authorizeUri: "https://opn/3ds" });
  });

  it("returns ok with no authorizeUri for an immediate (non-3DS) charge", async () => {
    makeCharge.mockResolvedValue({ payment: {}, charge: { authorize_uri: null } });
    expect(await payWithCard("bk1", "tokn_1", "https://app/th/trips/bk1/pay")).toEqual({ ok: true });
  });

  it("rejects when not awaiting payment", async () => {
    findBooking.mockResolvedValue({ userId: "g1", status: BookingStatus.EXPIRED });
    expect(await payWithCard("bk1", "tokn_1", "https://app/th/trips/bk1/pay")).toEqual({ ok: false, error: "errorWrongState" });
  });
});

describe("getBookingPaymentStatus", () => {
  it("returns the status for the owner", async () => {
    findBooking.mockResolvedValue({ userId: "g1", status: BookingStatus.CONFIRMED });
    expect(await getBookingPaymentStatus("bk1")).toEqual({ ok: true, status: BookingStatus.CONFIRMED });
  });
  it("rejects a non-owner", async () => {
    findBooking.mockResolvedValue({ userId: "other", status: BookingStatus.AWAITING_PAYMENT });
    expect(await getBookingPaymentStatus("bk1")).toEqual({ ok: false, error: "errorNotFound" });
  });
});
