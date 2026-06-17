import { EscrowState, LedgerCause } from "@prisma/client";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  EMPTY_BUCKETS,
  EscrowError,
  foldMove,
  INITIAL_POSITION,
  invariantHolds,
  reduce,
  type Buckets,
  type EscrowEvent,
  type Position,
} from "./escrow";

/** Fold a sequence of events through the reducer and read the buckets back. */
function run(events: EscrowEvent[]): { position: Position; buckets: Buckets } {
  let position = INITIAL_POSITION;
  let buckets = EMPTY_BUCKETS;
  for (const event of events) {
    const t = reduce(position, event);
    for (const m of t.moves) buckets = foldMove(buckets, m);
    position = t.position;
  }
  return { position, buckets };
}

describe("reduce — happy paths", () => {
  it("charge → release → pay disburses the whole amount", () => {
    const { position, buckets } = run([
      { type: "CHARGE", amountSatang: 12_900_00 },
      { type: "RELEASE" },
      { type: "PAY" },
    ]);
    expect(position.state).toBe(EscrowState.PAID);
    expect(buckets.received).toBe(12_900_00);
    expect(buckets.paidOut).toBe(12_900_00);
    expect(buckets.held + buckets.releasable + buckets.frozen).toBe(0);
    expect(invariantHolds(buckets)).toBe(true);
  });

  it("charge → settle(full) reverses the whole amount to the guest", () => {
    const { position, buckets } = run([
      { type: "CHARGE", amountSatang: 5_000_00 },
      { type: "SETTLE", refundSatang: 5_000_00, refundCause: LedgerCause.REFUND_GUEST_TIER },
    ]);
    expect(position.state).toBe(EscrowState.REVERSED);
    expect(buckets.refunded).toBe(5_000_00);
    expect(invariantHolds(buckets)).toBe(true);
  });

  it("charge → freeze → settle(0) releases the held amount to the host", () => {
    const { position, buckets } = run([
      { type: "CHARGE", amountSatang: 8_000_00 },
      { type: "FREEZE", cause: LedgerCause.HOLD_DISPUTE_OPENED },
      { type: "SETTLE", refundSatang: 0, refundCause: LedgerCause.REFUND_DISPUTE_FULL },
      { type: "PAY" },
    ]);
    expect(position.state).toBe(EscrowState.PAID);
    expect(buckets.paidOut).toBe(8_000_00);
    expect(buckets.refunded).toBe(0);
    expect(invariantHolds(buckets)).toBe(true);
  });

  it("charge → freeze → settle(partial) splits guest/host then settles", () => {
    const { buckets } = run([
      { type: "CHARGE", amountSatang: 10_000_00 },
      { type: "FREEZE", cause: LedgerCause.HOLD_DISPUTE_OPENED },
      { type: "SETTLE", refundSatang: 3_000_00, refundCause: LedgerCause.REFUND_DISPUTE_PARTIAL },
      { type: "PAY" }, // the 7,000 baht remainder
    ]);
    expect(buckets.refunded).toBe(3_000_00);
    expect(buckets.paidOut).toBe(7_000_00);
    expect(buckets.held + buckets.releasable + buckets.frozen).toBe(0);
    expect(invariantHolds(buckets)).toBe(true);
  });
});

describe("reduce — illegal transitions are rejected", () => {
  const charged = reduce(INITIAL_POSITION, { type: "CHARGE", amountSatang: 1_000_00 }).position;
  const releasable = reduce(charged, { type: "RELEASE" }).position;

  it("rejects a second charge", () => {
    expect(() => reduce(charged, { type: "CHARGE", amountSatang: 1 })).toThrow(EscrowError);
  });

  it("rejects PAY before RELEASE (still HELD)", () => {
    expect(() => reduce(charged, { type: "PAY" })).toThrowError(
      expect.objectContaining({ reason: "ILLEGAL_TRANSITION" }),
    );
  });

  it("rejects SETTLE on a RELEASABLE position", () => {
    expect(() =>
      reduce(releasable, {
        type: "SETTLE",
        refundSatang: 50_00,
        refundCause: LedgerCause.REFUND_GUEST_TIER,
      }),
    ).toThrowError(expect.objectContaining({ reason: "ILLEGAL_TRANSITION" }));
  });

  it("rejects a settlement refund larger than the held amount", () => {
    expect(() =>
      reduce(charged, {
        type: "SETTLE",
        refundSatang: 2_000_00,
        refundCause: LedgerCause.REFUND_GUEST_TIER,
      }),
    ).toThrowError(expect.objectContaining({ reason: "REFUND_OUT_OF_RANGE" }));
  });

  it("rejects a non-positive charge", () => {
    expect(() => reduce(INITIAL_POSITION, { type: "CHARGE", amountSatang: 0 })).toThrowError(
      expect.objectContaining({ reason: "NON_POSITIVE_AMOUNT" }),
    );
  });
});

// ── The acceptance criterion: the invariant holds over generated event
//    sequences (ADR-003 §Consequences). Many bookings share one set of global
//    buckets; after every applied move we re-assert
//    held + releasable + frozen === received − refunded − paidOut.

type GenIntent =
  | { type: "CHARGE"; amountSatang: number }
  | { type: "RELEASE" }
  | { type: "FREEZE"; cause: LedgerCause }
  | { type: "PAY" }
  | { type: "SETTLE"; refundPct: number; refundCause: LedgerCause };

const arbIntent: fc.Arbitrary<GenIntent> = fc.oneof(
  fc.integer({ min: 1, max: 5_000_000 }).map((amountSatang) => ({
    type: "CHARGE" as const,
    amountSatang,
  })),
  fc.constant({ type: "RELEASE" as const }),
  fc
    .constantFrom(
      LedgerCause.HOLD_DISPUTE_OPENED,
      LedgerCause.HOLD_BOOKING_REPORT,
      LedgerCause.HOLD_ADMIN_MANUAL,
    )
    .map((cause) => ({ type: "FREEZE" as const, cause })),
  fc.constant({ type: "PAY" as const }),
  fc
    .tuple(
      fc.integer({ min: 0, max: 100 }),
      fc.constantFrom(
        LedgerCause.REFUND_GUEST_TIER,
        LedgerCause.REFUND_HOST_CANCELLED,
        LedgerCause.REFUND_DISPUTE_FULL,
        LedgerCause.REFUND_DISPUTE_PARTIAL,
      ),
    )
    .map(([refundPct, refundCause]) => ({ type: "SETTLE" as const, refundPct, refundCause })),
);

/** Translate a generator intent into a concrete event for the current position. */
function toEvent(intent: GenIntent, held: number): EscrowEvent {
  switch (intent.type) {
    case "CHARGE":
      return { type: "CHARGE", amountSatang: intent.amountSatang };
    case "FREEZE":
      return { type: "FREEZE", cause: intent.cause as never };
    case "SETTLE":
      return {
        type: "SETTLE",
        refundSatang: Math.floor((held * intent.refundPct) / 100),
        refundCause: intent.refundCause as never,
      };
    default:
      return { type: intent.type };
  }
}

describe("reduce — escrow invariant (property)", () => {
  it("held + releasable + frozen === received − refunded − paidOut, always", () => {
    fc.assert(
      fc.property(fc.array(fc.array(arbIntent, { maxLength: 12 }), { maxLength: 8 }), (bookings) => {
        let buckets = EMPTY_BUCKETS;

        for (const intents of bookings) {
          let position = INITIAL_POSITION;

          for (const intent of intents) {
            const event = toEvent(intent, position.amountSatang);
            const before = buckets;
            try {
              const t = reduce(position, event);
              for (const m of t.moves) buckets = foldMove(buckets, m);
              position = t.position;
            } catch (err) {
              // Illegal transitions must reject WITHOUT moving any money.
              expect(err).toBeInstanceOf(EscrowError);
              expect(buckets).toEqual(before);
              continue;
            }

            expect(invariantHolds(buckets)).toBe(true);
            expect(buckets.held).toBeGreaterThanOrEqual(0);
            expect(buckets.releasable).toBeGreaterThanOrEqual(0);
            expect(buckets.frozen).toBeGreaterThanOrEqual(0);
          }
        }

        expect(invariantHolds(buckets)).toBe(true);
      }),
    );
  });
});
