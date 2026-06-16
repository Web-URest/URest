import { EscrowState, LedgerCause, type Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { claimWebhookEvent, currentPosition, freeze, recordCharge, release } from "./apply";

type Entry = { fromState: EscrowState | null; toState: EscrowState; amountSatang: number };

function fakeTx(opts: { escrowState?: EscrowState; entries?: Entry[]; webhookCount?: number } = {}) {
  const ledgerCreateMany = vi.fn().mockResolvedValue({ count: 1 });
  const bookingUpdate = vi.fn().mockResolvedValue({});
  const webhookCreateMany = vi.fn().mockResolvedValue({ count: opts.webhookCount ?? 1 });

  const tx = {
    booking: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ escrowState: opts.escrowState ?? EscrowState.NONE }),
      update: bookingUpdate,
    },
    ledgerEntry: {
      findMany: vi.fn().mockResolvedValue(opts.entries ?? []),
      createMany: ledgerCreateMany,
    },
    webhookEvent: { createMany: webhookCreateMany },
  } as unknown as Prisma.TransactionClient;

  return { tx, ledgerCreateMany, bookingUpdate, webhookCreateMany };
}

describe("currentPosition", () => {
  it("derives the in-escrow amount from the append-only log", async () => {
    const { tx } = fakeTx({
      escrowState: EscrowState.RELEASABLE,
      entries: [
        { fromState: EscrowState.NONE, toState: EscrowState.HELD, amountSatang: 10_000 },
        { fromState: EscrowState.HELD, toState: EscrowState.RELEASABLE, amountSatang: 10_000 },
      ],
    });
    expect(await currentPosition(tx, "b1")).toEqual({
      state: EscrowState.RELEASABLE,
      amountSatang: 10_000,
    });
  });

  it("reports zero once the money has been disbursed", async () => {
    const { tx } = fakeTx({
      escrowState: EscrowState.PAID,
      entries: [
        { fromState: EscrowState.NONE, toState: EscrowState.HELD, amountSatang: 10_000 },
        { fromState: EscrowState.HELD, toState: EscrowState.RELEASABLE, amountSatang: 10_000 },
        { fromState: EscrowState.RELEASABLE, toState: EscrowState.PAID, amountSatang: 10_000 },
      ],
    });
    expect(await currentPosition(tx, "b1")).toEqual({ state: EscrowState.PAID, amountSatang: 0 });
  });
});

describe("escrow moves write the ledger + refresh the cache", () => {
  it("recordCharge appends NONE→HELD and caches HELD", async () => {
    const { tx, ledgerCreateMany, bookingUpdate } = fakeTx();
    await recordCharge(tx, "b1", 12_900_00, "evt_1");

    expect(ledgerCreateMany).toHaveBeenCalledWith({
      data: [
        {
          bookingId: "b1",
          amountSatang: 12_900_00,
          fromState: EscrowState.NONE,
          toState: EscrowState.HELD,
          cause: LedgerCause.CHARGE_WEBHOOK,
          causeRef: "evt_1",
          actor: null,
        },
      ],
    });
    expect(bookingUpdate).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { escrowState: EscrowState.HELD },
    });
  });

  it("release moves HELD→RELEASABLE for the held amount", async () => {
    const { tx, ledgerCreateMany, bookingUpdate } = fakeTx({
      escrowState: EscrowState.HELD,
      entries: [{ fromState: EscrowState.NONE, toState: EscrowState.HELD, amountSatang: 8_000_00 }],
    });
    await release(tx, "b1");

    expect(ledgerCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          amountSatang: 8_000_00,
          fromState: EscrowState.HELD,
          toState: EscrowState.RELEASABLE,
          cause: LedgerCause.RELEASE_CHECKOUT,
        }),
      ],
    });
    expect(bookingUpdate).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { escrowState: EscrowState.RELEASABLE },
    });
  });

  it("freeze records the supplied cause", async () => {
    const { tx, ledgerCreateMany } = fakeTx({
      escrowState: EscrowState.HELD,
      entries: [{ fromState: EscrowState.NONE, toState: EscrowState.HELD, amountSatang: 5_000_00 }],
    });
    await freeze(tx, "b1", LedgerCause.HOLD_DISPUTE_OPENED, "dispute_9");

    expect(ledgerCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          toState: EscrowState.FROZEN,
          cause: LedgerCause.HOLD_DISPUTE_OPENED,
          causeRef: "dispute_9",
        }),
      ],
    });
  });
});

describe("claimWebhookEvent", () => {
  it("returns true the first time an event id is seen", async () => {
    const { tx } = fakeTx({ webhookCount: 1 });
    expect(await claimWebhookEvent(tx, "evt_1", {}, new Date(0))).toBe(true);
  });

  it("returns false on a replay (skipDuplicates inserted nothing)", async () => {
    const { tx } = fakeTx({ webhookCount: 0 });
    expect(await claimWebhookEvent(tx, "evt_1", {}, new Date(0))).toBe(false);
  });
});
