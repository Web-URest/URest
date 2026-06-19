import { BookingStatus, EscrowState, LedgerCause } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    dispute: { create: vi.fn(), update: vi.fn() },
    refund: { create: vi.fn(), upsert: vi.fn() },
    hostStrike: { create: vi.fn(), count: vi.fn() },
    user: { update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/ledger/apply", () => ({
  claimWebhookEvent: vi.fn(),
  recordCharge: vi.fn(),
  release: vi.fn(),
  freeze: vi.fn(),
  settle: vi.fn(),
  payout: vi.fn(),
  currentPosition: vi.fn(),
}));

vi.mock("@/lib/ledger/code", () => ({
  issueBookingCode: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { claimWebhookEvent, currentPosition, freeze, recordCharge, release, settle } from "@/lib/ledger/apply";
import { issueBookingCode } from "@/lib/ledger/code";
import { EscrowError } from "@/lib/ledger/escrow";

import {
  accept,
  appealDispute,
  BookingError,
  cancelByGuest,
  cancelByHost,
  complete,
  confirmFromWebhook,
  expire,
  openDispute,
  request,
  resolveAppeal,
  resolveDispute,
} from "./transitions";

const create = prisma.booking.create as unknown as Mock;
const findUnique = prisma.booking.findUnique as unknown as Mock;
const update = prisma.booking.update as unknown as Mock;
const disputeCreate = prisma.dispute.create as unknown as Mock;
const refundCreate = prisma.refund.create as unknown as Mock;
const strikeCreate = prisma.hostStrike.create as unknown as Mock;
const strikeCount = prisma.hostStrike.count as unknown as Mock;
const userUpdate = prisma.user.update as unknown as Mock;
const auditCreate = prisma.auditLog.create as unknown as Mock;
const disputeUpdate = prisma.dispute.update as unknown as Mock;
const refundUpsert = prisma.refund.upsert as unknown as Mock;
const positionMock = currentPosition as unknown as Mock;
const txRun = prisma.$transaction as unknown as Mock;

const NOW = new Date("2026-06-20T03:00:00.000Z");

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "bk1",
    listingId: "l1",
    userId: "guest1",
    status: BookingStatus.CONFIRMED,
    checkIn: new Date("2026-07-01T00:00:00.000Z"),
    checkOut: new Date("2026-07-03T00:00:00.000Z"),
    respondBy: null,
    payBy: null,
    totalSatang: 10_000_00,
    commissionSatang: 1_000_00,
    cancellationTier: "MODERATE",
    escrowState: EscrowState.HELD,
    listing: { hostId: "host1" },
    dispute: null,
    ...over,
  };
}

beforeEach(() => {
  // Interactive transactions run the callback with the same mocked client.
  txRun.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    booking(data),
  );
});

afterEach(() => vi.clearAllMocks());

describe("request", () => {
  it("creates a REQUESTED booking with a host-response deadline", async () => {
    create.mockResolvedValue(booking({ status: BookingStatus.REQUESTED }));
    await request(
      {
        listingId: "l1",
        userId: "guest1",
        checkIn: new Date("2026-07-01"),
        checkOut: new Date("2026-07-03"),
        priceLines: [],
        totalSatang: 10_000_00,
        commissionSatang: 1_000_00,
        cancellationTier: "MODERATE",
      },
      NOW,
    );
    const arg = create.mock.calls[0]?.[0].data;
    expect(arg.status).toBe(BookingStatus.REQUESTED);
    expect(arg.bookingMode).toBe("REQUEST");
    expect(arg.respondBy).toEqual(new Date("2026-06-20T15:00:00.000Z")); // +12h
  });
});

describe("accept", () => {
  it("rejects a non-owning host", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.REQUESTED, listing: { hostId: "other" } }));
    await expect(accept("bk1", "host1", NOW)).rejects.toMatchObject({ reason: "NOT_HOST" });
  });

  it("rejects when the booking isn't REQUESTED", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.CONFIRMED }));
    await expect(accept("bk1", "host1", NOW)).rejects.toMatchObject({ reason: "WRONG_STATE" });
  });

  it("moves REQUESTED → AWAITING_PAYMENT with a payment deadline", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.REQUESTED }));
    await accept("bk1", "host1", NOW);
    expect(update).toHaveBeenCalledWith({
      where: { id: "bk1" },
      data: { status: BookingStatus.AWAITING_PAYMENT, payBy: new Date("2026-06-20T15:00:00.000Z") },
    });
  });
});

describe("expire", () => {
  it("refuses to expire before the deadline elapses", async () => {
    findUnique.mockResolvedValue(
      booking({ status: BookingStatus.REQUESTED, respondBy: new Date("2026-06-21T00:00:00.000Z") }),
    );
    await expect(expire("bk1", NOW)).rejects.toMatchObject({ reason: "DEADLINE_NOT_PASSED" });
  });

  it("expires a REQUESTED booking past its respond-by", async () => {
    findUnique.mockResolvedValue(
      booking({ status: BookingStatus.REQUESTED, respondBy: new Date("2026-06-19T00:00:00.000Z") }),
    );
    await expire("bk1", NOW);
    expect(update).toHaveBeenCalledWith({ where: { id: "bk1" }, data: { status: BookingStatus.EXPIRED } });
  });
});

describe("confirmFromWebhook", () => {
  it("confirms, mints a code, unmasks contact, and charges escrow", async () => {
    (claimWebhookEvent as unknown as Mock).mockResolvedValue(true);
    (issueBookingCode as unknown as Mock).mockResolvedValue("UR-2606-0001");
    findUnique.mockResolvedValue(booking({ status: BookingStatus.AWAITING_PAYMENT }));

    const result = await confirmFromWebhook({ bookingId: "bk1", opnEventId: "evt_1", payload: {} }, NOW);

    expect(update).toHaveBeenCalledWith({
      where: { id: "bk1" },
      data: { status: BookingStatus.CONFIRMED, code: "UR-2606-0001", contactUnmaskedAt: NOW },
    });
    expect(recordCharge).toHaveBeenCalledWith(prisma, "bk1", 10_000_00, "evt_1");
    expect(result.freshlyConfirmed).toBe(true);
  });

  it("is a no-op on a replayed event id", async () => {
    (claimWebhookEvent as unknown as Mock).mockResolvedValue(false);
    findUnique.mockResolvedValue(booking({ status: BookingStatus.CONFIRMED }));

    const result = await confirmFromWebhook({ bookingId: "bk1", opnEventId: "evt_1", payload: {} }, NOW);

    expect(update).not.toHaveBeenCalled();
    expect(recordCharge).not.toHaveBeenCalled();
    expect(issueBookingCode).not.toHaveBeenCalled();
    expect(result.freshlyConfirmed).toBe(false);
  });

  it("rejects a charge for a booking not awaiting payment", async () => {
    (claimWebhookEvent as unknown as Mock).mockResolvedValue(true);
    findUnique.mockResolvedValue(booking({ status: BookingStatus.CONFIRMED }));
    await expect(
      confirmFromWebhook({ bookingId: "bk1", opnEventId: "evt_1", payload: {} }, NOW),
    ).rejects.toBeInstanceOf(BookingError);
  });
});

describe("complete", () => {
  it("completes a checked-in stay and releases the escrow", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.CHECKED_IN, escrowState: EscrowState.HELD }));
    await complete("bk1");
    expect(update).toHaveBeenCalledWith({ where: { id: "bk1" }, data: { status: BookingStatus.COMPLETED } });
    expect(release).toHaveBeenCalledWith(prisma, "bk1");
  });
});

describe("cancelByGuest", () => {
  it("withdraws a pre-payment booking with no refund movement", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.AWAITING_PAYMENT }));
    await cancelByGuest("bk1", "guest1", NOW);
    expect(update).toHaveBeenCalledWith({
      where: { id: "bk1" },
      data: { status: BookingStatus.CANCELLED_BY_GUEST },
    });
    expect(settle).not.toHaveBeenCalled();
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-guest", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.CONFIRMED }));
    await expect(cancelByGuest("bk1", "intruder", NOW)).rejects.toMatchObject({ reason: "NOT_GUEST" });
  });

  it("refunds per tier and settles escrow when CONFIRMED", async () => {
    // MODERATE, 11 days out → 100% refund.
    findUnique.mockResolvedValue(booking({ status: BookingStatus.CONFIRMED }));
    await cancelByGuest("bk1", "guest1", NOW);
    expect(refundCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ bookingId: "bk1", refundSatang: 10_000_00 }),
    });
    expect(settle).toHaveBeenCalledWith(prisma, "bk1", 10_000_00, LedgerCause.REFUND_GUEST_TIER);
  });
});

describe("cancelByHost", () => {
  it("refunds 100%, strikes the host, and suspends on the third strike", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.CONFIRMED }));
    strikeCount.mockResolvedValue(3);

    await cancelByHost("bk1", "host1", NOW);

    expect(update).toHaveBeenCalledWith({
      where: { id: "bk1" },
      data: { status: BookingStatus.CANCELLED_BY_HOST },
    });
    expect(settle).toHaveBeenCalledWith(prisma, "bk1", 10_000_00, LedgerCause.REFUND_HOST_CANCELLED);
    expect(strikeCreate).toHaveBeenCalledWith({
      data: { hostUserId: "host1", bookingId: "bk1", reason: "HOST_CANCELLED" },
    });
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "host1" }, data: { suspendedAt: NOW } });
  });

  it("does not suspend before the third strike", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.CONFIRMED }));
    strikeCount.mockResolvedValue(1);
    await cancelByHost("bk1", "host1", NOW);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("openDispute", () => {
  it("freezes the payout and opens a dispute", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.CHECKED_IN }));
    disputeCreate.mockResolvedValue({ id: "disp1" });

    await openDispute("bk1", "guest1");

    expect(update).toHaveBeenCalledWith({ where: { id: "bk1" }, data: { status: BookingStatus.DISPUTED } });
    expect(disputeCreate).toHaveBeenCalledWith({ data: { bookingId: "bk1" } });
    expect(freeze).toHaveBeenCalledWith(prisma, "bk1", LedgerCause.HOLD_DISPUTE_OPENED, "disp1");
  });
});

describe("resolveDispute", () => {
  it("settles a partial resolution and completes the booking", async () => {
    findUnique.mockResolvedValue(
      booking({ status: BookingStatus.DISPUTED, dispute: { status: "OPEN" } }),
    );
    (prisma.dispute.update as unknown as Mock).mockResolvedValue({});

    await resolveDispute("bk1", "admin1", { kind: "PARTIAL", refundPct: 40 }, NOW);

    // 40% of 10,000 baht → 4,000 to guest.
    expect(settle).toHaveBeenCalledWith(
      prisma,
      "bk1",
      4_000_00,
      LedgerCause.REFUND_DISPUTE_PARTIAL,
      "admin1",
    );
    expect(update).toHaveBeenCalledWith({ where: { id: "bk1" }, data: { status: BookingStatus.COMPLETED } });
  });

  it("writes a DISPUTE_RESOLVED audit row in the same transaction", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.DISPUTED, dispute: { status: "OPEN" } }));
    (prisma.dispute.update as unknown as Mock).mockResolvedValue({});

    await resolveDispute("bk1", "admin1", { kind: "RELEASED" }, NOW);

    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        adminId: "admin1",
        action: "DISPUTE_RESOLVED",
        targetType: "Booking",
        targetId: "bk1",
        after: { kind: "RELEASED" },
      },
    });
  });

  it("rejects resolving a booking whose dispute isn't open", async () => {
    findUnique.mockResolvedValue(booking({ status: BookingStatus.DISPUTED, dispute: { status: "RESOLVED_RELEASED" } }));
    await expect(
      resolveDispute("bk1", "admin1", { kind: "RELEASED" }, NOW),
    ).rejects.toMatchObject({ reason: "DISPUTE_NOT_OPEN" });
  });
});

describe("appealDispute", () => {
  const resolved = () =>
    booking({
      status: BookingStatus.COMPLETED,
      escrowState: EscrowState.RELEASABLE,
      dispute: { id: "disp1", status: "RESOLVED_RELEASED", guestAppealedAt: null, hostAppealedAt: null },
    });

  it("records the guest's appeal and re-freezes the releasable escrow", async () => {
    findUnique.mockResolvedValue(resolved());

    await appealDispute("bk1", "guest1", "GUEST", NOW);

    expect(disputeUpdate).toHaveBeenCalledWith({
      where: { bookingId: "bk1" },
      data: { guestAppealedAt: NOW },
    });
    expect(freeze).toHaveBeenCalledWith(prisma, "bk1", LedgerCause.HOLD_DISPUTE_OPENED, "disp1");
  });

  it("rejects a second appeal from the same side", async () => {
    findUnique.mockResolvedValue(
      booking({
        status: BookingStatus.COMPLETED,
        escrowState: EscrowState.RELEASABLE,
        dispute: { id: "disp1", status: "RESOLVED_RELEASED", guestAppealedAt: NOW, hostAppealedAt: null },
      }),
    );
    await expect(appealDispute("bk1", "guest1", "GUEST", NOW)).rejects.toMatchObject({
      reason: "ALREADY_APPEALED",
    });
  });

  it("rejects an appeal of a dispute that isn't resolved yet", async () => {
    findUnique.mockResolvedValue(
      booking({ status: BookingStatus.DISPUTED, dispute: { id: "disp1", status: "OPEN" } }),
    );
    await expect(appealDispute("bk1", "guest1", "GUEST", NOW)).rejects.toMatchObject({
      reason: "WRONG_STATE",
    });
  });

  it("rejects a non-guest acting on the guest's behalf", async () => {
    findUnique.mockResolvedValue(resolved());
    await expect(appealDispute("bk1", "intruder", "GUEST", NOW)).rejects.toMatchObject({
      reason: "NOT_GUEST",
    });
  });

  it("records the appeal as advisory when the escrow can't be re-frozen", async () => {
    findUnique.mockResolvedValue(
      booking({
        status: BookingStatus.CANCELLED_BY_HOST,
        escrowState: EscrowState.REVERSED,
        dispute: { id: "disp1", status: "RESOLVED_REFUNDED", guestAppealedAt: null, hostAppealedAt: null },
      }),
    );
    (freeze as unknown as Mock).mockRejectedValue(new EscrowError("ILLEGAL_TRANSITION"));

    // Does NOT throw — the appeal flag is still recorded.
    await appealDispute("bk1", "host1", "HOST", NOW);
    expect(disputeUpdate).toHaveBeenCalledWith({
      where: { bookingId: "bk1" },
      data: { hostAppealedAt: NOW },
    });
  });
});

describe("resolveAppeal", () => {
  const frozenAppeal = () =>
    booking({
      status: BookingStatus.COMPLETED,
      escrowState: EscrowState.FROZEN,
      dispute: { id: "disp1", status: "RESOLVED_RELEASED", guestAppealedAt: NOW, hostAppealedAt: null },
    });

  it("rejects when the escrow isn't frozen (the one-shot appeal lock)", async () => {
    findUnique.mockResolvedValue(
      booking({ status: BookingStatus.COMPLETED, escrowState: EscrowState.RELEASABLE, dispute: { id: "disp1", status: "RESOLVED_RELEASED" } }),
    );
    await expect(resolveAppeal("bk1", "admin1", { kind: "REFUNDED" }, NOW)).rejects.toMatchObject({
      reason: "APPEAL_NOT_OPEN",
    });
  });

  it("refunds the full frozen pot to the guest, strikes the host, and audits", async () => {
    findUnique.mockResolvedValue(frozenAppeal());
    positionMock.mockResolvedValue({ state: EscrowState.FROZEN, amountSatang: 10_000_00 });
    disputeUpdate.mockResolvedValue({});
    strikeCount.mockResolvedValue(1);

    await resolveAppeal("bk1", "admin1", { kind: "REFUNDED" }, NOW);

    expect(settle).toHaveBeenCalledWith(prisma, "bk1", 10_000_00, LedgerCause.REFUND_DISPUTE_FULL, "admin1");
    expect(strikeCreate).toHaveBeenCalledWith({
      data: { hostUserId: "host1", bookingId: "bk1", reason: "HOST_CANCELLED" },
    });
    expect(update).toHaveBeenCalledWith({ where: { id: "bk1" }, data: { status: BookingStatus.CANCELLED_BY_HOST } });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        adminId: "admin1",
        action: "DISPUTE_APPEAL_RESOLVED",
        targetType: "Booking",
        targetId: "bk1",
        after: { kind: "REFUNDED" },
      },
    });
  });

  it("partial-refunds against the frozen pot (bounded by the remainder)", async () => {
    findUnique.mockResolvedValue(frozenAppeal());
    positionMock.mockResolvedValue({ state: EscrowState.FROZEN, amountSatang: 6_000_00 });
    disputeUpdate.mockResolvedValue({});

    await resolveAppeal("bk1", "admin1", { kind: "PARTIAL", refundPct: 50 }, NOW);

    // 50% of the 6,000-baht frozen remainder → 3,000 to guest.
    expect(settle).toHaveBeenCalledWith(prisma, "bk1", 3_000_00, LedgerCause.REFUND_DISPUTE_PARTIAL, "admin1");
    expect(refundUpsert).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: "bk1" }, data: { status: BookingStatus.COMPLETED } });
  });
});
