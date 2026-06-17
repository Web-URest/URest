/**
 * Escrow ledger core (ADR-003) — the one place over-engineering is justified.
 *
 * This is a PURE state machine: `reduce(position, event)` returns the new
 * per-booking escrow position plus the append-only `LedgerEntry` rows the move
 * produces — no Prisma, no clock. ADR-003 §4: "a pure function
 * `(currentState, event) → newState | reject`". `apply.ts` wraps this with the
 * DB transaction; `escrow.test.ts` drives it with fast-check to prove the
 * invariant (PRODUCT_FLOWS §2.3, ADR-003 §Context):
 *
 *     sum(HELD) + sum(RELEASABLE) + sum(FROZEN) = received − refunded − paidOut
 *
 * Money is integer satang throughout (rule 1).
 */

import { EscrowState, LedgerCause } from "@prisma/client";

import { assertSatang } from "@/lib/money";

export type EscrowErrorReason =
  | "ALREADY_CHARGED" // a position can only be charged once (from NONE)
  | "ILLEGAL_TRANSITION" // the current state can't accept this event
  | "NON_POSITIVE_AMOUNT" // a charge must be > 0
  | "REFUND_OUT_OF_RANGE"; // a settlement refund must be within [0, held]

export class EscrowError extends Error {
  constructor(public readonly reason: EscrowErrorReason) {
    super(reason);
    this.name = "EscrowError";
  }
}

/** A single booking's escrow position: where its remaining money sits + how much. */
export interface Position {
  state: EscrowState;
  /** Satang still in escrow (HELD/RELEASABLE/FROZEN); 0 once disbursed/reversed. */
  amountSatang: number;
}

export const INITIAL_POSITION: Position = { state: EscrowState.NONE, amountSatang: 0 };

export type FreezeCause =
  | typeof LedgerCause.HOLD_DISPUTE_OPENED
  | typeof LedgerCause.HOLD_BOOKING_REPORT
  | typeof LedgerCause.HOLD_ADMIN_MANUAL;

export type RefundCause =
  | typeof LedgerCause.REFUND_GUEST_TIER
  | typeof LedgerCause.REFUND_HOST_CANCELLED
  | typeof LedgerCause.REFUND_DISPUTE_FULL
  | typeof LedgerCause.REFUND_DISPUTE_PARTIAL;

/**
 * A move applied to ONE booking's position (PRODUCT_FLOWS §2.3 escrow diagram):
 * - CHARGE  — Opn charge succeeded → HELD.
 * - RELEASE — clean checkout, no dispute → RELEASABLE.
 * - FREEZE  — dispute / booking report / admin hold → FROZEN.
 * - PAY     — admin bank transfer → PAID (leaves escrow).
 * - SETTLE  — refund `refundSatang` to the guest, release the rest to the host.
 *   Covers a guest cancellation (from HELD), a host cancellation / full refund
 *   (refundSatang === held), and a dispute resolution (from FROZEN — full,
 *   partial, or released-to-host when refundSatang === 0).
 */
export type EscrowEvent =
  | { type: "CHARGE"; amountSatang: number }
  | { type: "RELEASE" }
  | { type: "FREEZE"; cause: FreezeCause }
  | { type: "PAY" }
  | { type: "SETTLE"; refundSatang: number; refundCause: RefundCause };

/** An append-only ledger row: `amountSatang` moving from one bucket to another. */
export interface LedgerMove {
  fromState: EscrowState;
  toState: EscrowState;
  amountSatang: number;
  cause: LedgerCause;
}

export interface Transition {
  position: Position;
  /** Usually one move; a partial settlement produces two (the refund + the release). */
  moves: LedgerMove[];
}

/**
 * Apply one event to a booking's position. Returns the new position + the
 * ledger moves to append, or throws `EscrowError` on an illegal transition.
 * Every move is balanced (see `foldMove`), so the invariant is preserved by
 * construction — the property test proves `reduce` never breaks that.
 */
export function reduce(position: Position, event: EscrowEvent): Transition {
  const { state, amountSatang: held } = position;

  switch (event.type) {
    case "CHARGE": {
      if (state !== EscrowState.NONE) throw new EscrowError("ALREADY_CHARGED");
      const amount = assertSatang(event.amountSatang);
      if (amount <= 0) throw new EscrowError("NON_POSITIVE_AMOUNT");
      return {
        position: { state: EscrowState.HELD, amountSatang: amount },
        moves: [move(EscrowState.NONE, EscrowState.HELD, amount, LedgerCause.CHARGE_WEBHOOK)],
      };
    }

    case "RELEASE": {
      if (state !== EscrowState.HELD) throw new EscrowError("ILLEGAL_TRANSITION");
      return {
        position: { state: EscrowState.RELEASABLE, amountSatang: held },
        moves: [move(state, EscrowState.RELEASABLE, held, LedgerCause.RELEASE_CHECKOUT)],
      };
    }

    case "FREEZE": {
      if (state !== EscrowState.HELD && state !== EscrowState.RELEASABLE) {
        throw new EscrowError("ILLEGAL_TRANSITION");
      }
      return {
        position: { state: EscrowState.FROZEN, amountSatang: held },
        moves: [move(state, EscrowState.FROZEN, held, event.cause)],
      };
    }

    case "PAY": {
      if (state !== EscrowState.RELEASABLE) throw new EscrowError("ILLEGAL_TRANSITION");
      return {
        position: { state: EscrowState.PAID, amountSatang: 0 },
        moves: [move(state, EscrowState.PAID, held, LedgerCause.PAID_ADMIN_TRANSFER)],
      };
    }

    case "SETTLE": {
      if (state !== EscrowState.HELD && state !== EscrowState.FROZEN) {
        throw new EscrowError("ILLEGAL_TRANSITION");
      }
      if (held <= 0) throw new EscrowError("ILLEGAL_TRANSITION");
      const refund = assertSatang(event.refundSatang);
      if (refund < 0 || refund > held) throw new EscrowError("REFUND_OUT_OF_RANGE");

      const remainder = held - refund;
      const moves: LedgerMove[] = [];
      if (refund > 0) moves.push(move(state, EscrowState.REVERSED, refund, event.refundCause));
      if (remainder > 0) {
        // The host's remaining portion is now releasable for payout.
        moves.push(move(state, EscrowState.RELEASABLE, remainder, LedgerCause.RELEASE_HOLD_LIFTED));
      }

      return {
        position:
          remainder > 0
            ? { state: EscrowState.RELEASABLE, amountSatang: remainder }
            : { state: EscrowState.REVERSED, amountSatang: 0 },
        moves,
      };
    }
  }
}

function move(
  fromState: EscrowState,
  toState: EscrowState,
  amountSatang: number,
  cause: LedgerCause,
): LedgerMove {
  return { fromState, toState, amountSatang: assertSatang(amountSatang), cause };
}

/** The six running totals the escrow invariant is stated over. */
export interface Buckets {
  received: number; // Opn charges in
  refunded: number; // back to guests
  paidOut: number; // disbursed out of escrow at settlement
  held: number;
  releasable: number;
  frozen: number;
}

export const EMPTY_BUCKETS: Buckets = {
  received: 0,
  refunded: 0,
  paidOut: 0,
  held: 0,
  releasable: 0,
  frozen: 0,
};

const IN_ESCROW_BUCKET: Partial<Record<EscrowState, keyof Buckets>> = {
  [EscrowState.HELD]: "held",
  [EscrowState.RELEASABLE]: "releasable",
  [EscrowState.FROZEN]: "frozen",
};

/**
 * Fold one move into the running totals. A `fromState` of NONE is an inflow
 * (`received`); HELD/RELEASABLE/FROZEN decrement their in-escrow bucket. A
 * `toState` of REVERSED is a guest refund, PAID a host disbursement, otherwise
 * it increments the in-escrow bucket. Pure; returns a new `Buckets`.
 */
export function foldMove(buckets: Buckets, m: LedgerMove): Buckets {
  const next = { ...buckets };
  const amount = assertSatang(m.amountSatang);

  if (m.fromState === EscrowState.NONE) {
    next.received += amount;
  } else {
    const fromBucket = IN_ESCROW_BUCKET[m.fromState];
    if (fromBucket) next[fromBucket] -= amount;
  }

  if (m.toState === EscrowState.REVERSED) {
    next.refunded += amount;
  } else if (m.toState === EscrowState.PAID) {
    next.paidOut += amount;
  } else {
    const toBucket = IN_ESCROW_BUCKET[m.toState];
    if (toBucket) next[toBucket] += amount;
  }

  return next;
}

/** The escrow invariant (ADR-003 §Context): in-escrow = received − refunded − paidOut. */
export function invariantHolds(b: Buckets): boolean {
  return b.held + b.releasable + b.frozen === b.received - b.refunded - b.paidOut;
}
