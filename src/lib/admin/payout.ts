/**
 * Payout admin operations (PRODUCT_FLOWS §5.2) — the admin side of the escrow
 * money lifecycle: reconcile, the single audited account-number decryption,
 * mark-paid (RELEASABLE→PAID via lib/ledger), and manual payout holds.
 *
 * escrowState is mutated ONLY through `lib/ledger` (`payout`); this module never
 * writes a status field directly (rule 2). Holds are administrative `PayoutHold`
 * rows and leave escrow untouched (distinct from the dispute auto-freeze, #27).
 */
import { EscrowState } from "@prisma/client";

import { decryptField } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { invariantHolds } from "@/lib/ledger/escrow";
import { ledgerTotals, payout } from "@/lib/ledger/apply";
import { notify } from "@/lib/notifications";
import { getBalance } from "@/lib/payments/opn";

import type { AdminPrincipal } from "./auth";

export type PayoutErrorReason =
  | "ACCOUNT_NOT_FOUND"
  | "NOT_FOUND"
  | "NOT_RELEASABLE"
  | "ON_HOLD"
  | "RECONCILE_BLOCKED"
  | "NO_PAYOUT_ACCOUNT"
  | "SLIP_REQUIRED"
  | "REASON_REQUIRED"
  | "TARGET_REQUIRED";

export class PayoutError extends Error {
  constructor(public readonly reason: PayoutErrorReason) {
    super(reason);
    this.name = "PayoutError";
  }
}

export interface Reconciliation {
  /** The escrow invariant holds across the whole ledger. */
  invariantOk: boolean;
  /** Live gateway balance (satang). */
  opnTotalSatang: number;
  /** What escrow still owes out: held + releasable + frozen (satang). */
  obligationSatang: number;
  /** Safe to pay out: integrity holds AND the gateway is solvent for the obligation. */
  ok: boolean;
}

/**
 * §5.2 reconciliation gate. Blocks payouts on a ledger-integrity failure OR a
 * gateway shortfall. A *surplus* (retained 10% commission sitting in the Opn
 * balance) is expected and fine — hence `>=`, not equality.
 */
export async function reconcile(): Promise<Reconciliation> {
  const [b, balance] = await Promise.all([ledgerTotals(), getBalance()]);
  const invariantOk = invariantHolds(b);
  const obligationSatang = b.held + b.releasable + b.frozen;
  const ok = invariantOk && balance.total >= obligationSatang;
  return { invariantOk, opnTotalSatang: balance.total, obligationSatang, ok };
}

/**
 * §5.2 — the ONLY code path that decrypts `PayoutAccount.accountNumberEnc`
 * (rules 9/10). Every call writes an `AuditLog` row (no plaintext in it) before
 * returning the number to the admin UI for the bank transfer. The due list shows
 * only `bankCode` + `accountName`; nothing else decrypts.
 */
export async function revealAccountNumber(
  admin: AdminPrincipal,
  payoutAccountId: string,
): Promise<{ accountNumber: string; bankCode: string; accountName: string }> {
  const acct = await prisma.payoutAccount.findUnique({ where: { id: payoutAccountId } });
  if (!acct) throw new PayoutError("ACCOUNT_NOT_FOUND");

  const accountNumber = decryptField(acct.accountNumberEnc);
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "PAYOUT_ACCOUNT_DECRYPTED",
      targetType: "PayoutAccount",
      targetId: acct.id,
    },
  });

  return { accountNumber, bankCode: acct.bankCode, accountName: acct.accountName };
}

/**
 * §5.2 mark-paid: discharge a RELEASABLE booking's escrow to the host. The
 * reconciliation gate (acceptance #3) and the no-active-hold check run BEFORE
 * any write. The ledger move + the `Payout` record + the audit row commit in one
 * interactive transaction (escrow ops consume `tx`); the host LINE push fires
 * after. Double-pay is structurally impossible: `payout()` rejects once escrow
 * is PAID and `Payout.bookingId` is unique.
 */
export async function markPaid(admin: AdminPrincipal, bookingId: string, slipRef: string): Promise<void> {
  const ref = slipRef.trim();
  if (!ref) throw new PayoutError("SLIP_REQUIRED");

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      escrowState: true,
      totalSatang: true,
      commissionSatang: true,
      code: true,
      listing: { select: { hostId: true } },
    },
  });
  if (!booking) throw new PayoutError("NOT_FOUND");
  if (booking.escrowState !== EscrowState.RELEASABLE) throw new PayoutError("NOT_RELEASABLE");

  const hostId = booking.listing.hostId;
  const activeHold = await prisma.payoutHold.findFirst({
    where: { releasedAt: null, OR: [{ bookingId }, { hostUserId: hostId }] },
  });
  if (activeHold) throw new PayoutError("ON_HOLD");

  const account = await prisma.payoutAccount.findFirst({
    where: { userId: hostId },
    orderBy: { createdAt: "desc" },
  });
  if (!account) throw new PayoutError("NO_PAYOUT_ACCOUNT");

  const { ok } = await reconcile();
  if (!ok) throw new PayoutError("RECONCILE_BLOCKED");

  const hostAmountSatang = booking.totalSatang - booking.commissionSatang; // host keeps 90%
  await prisma.$transaction(async (tx) => {
    await payout(tx, bookingId, admin.id); // ledger RELEASABLE→PAID (sole escrowState writer)
    await tx.payout.create({
      data: {
        bookingId,
        payoutAccountId: account.id,
        hostAmountSatang,
        slipRef: ref,
        paidByAdminId: admin.id,
        paidAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: "PAYOUT_PAID",
        targetType: "Booking",
        targetId: bookingId,
        after: { hostAmountSatang, slipRef: ref },
      },
    });
  });

  if (booking.code) {
    await notify(hostId, "PAYOUT_PAID_HOST", {
      amountSatang: hostAmountSatang,
      slipRef: ref,
      code: booking.code,
    });
  }
}

/** A manual payout hold is scoped to exactly one booking OR one whole host (§5.2 / CHECK №4). */
export type HoldTarget = { bookingId: string } | { hostUserId: string };

/**
 * Place a manual payout hold — administrative, NOT an escrow freeze (escrowState
 * stays put; the due list simply skips held items, §5.2 / #27). Hold row + audit
 * commit together; the affected host is notified.
 */
export async function placeHold(admin: AdminPrincipal, target: HoldTarget, reason: string): Promise<void> {
  const trimmed = reason.trim();
  const bookingId = "bookingId" in target ? target.bookingId : undefined;
  const hostUserId = "hostUserId" in target ? target.hostUserId : undefined;
  if ((bookingId ? 1 : 0) + (hostUserId ? 1 : 0) !== 1) throw new PayoutError("TARGET_REQUIRED");
  if (!trimmed) throw new PayoutError("REASON_REQUIRED");

  // Resolve whom to notify: the booking's host, or the named host.
  let notifyHostId = hostUserId;
  if (bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { listing: { select: { hostId: true } } },
    });
    if (!booking) throw new PayoutError("NOT_FOUND");
    notifyHostId = booking.listing.hostId;
  }

  await prisma.$transaction([
    prisma.payoutHold.create({
      data: {
        bookingId: bookingId ?? null,
        hostUserId: hostUserId ?? null,
        reason: trimmed,
        createdByAdminId: admin.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: "PAYOUT_HOLD_CREATED",
        targetType: bookingId ? "Booking" : "User",
        targetId: (bookingId ?? hostUserId)!,
        after: { reason: trimmed },
      },
    }),
  ]);

  if (notifyHostId) await notify(notifyHostId, "PAYOUT_HOLD_CREATED", { reason: trimmed });
}

/** Lift a hold (reversible, audited): set `releasedAt`/`releasedByAdminId`, notify the host. */
export async function releaseHold(admin: AdminPrincipal, holdId: string): Promise<void> {
  const hold = await prisma.payoutHold.findUnique({
    where: { id: holdId },
    select: {
      id: true,
      bookingId: true,
      hostUserId: true,
      releasedAt: true,
      booking: { select: { listing: { select: { hostId: true } } } },
    },
  });
  if (!hold || hold.releasedAt) throw new PayoutError("NOT_FOUND");

  await prisma.$transaction([
    prisma.payoutHold.update({
      where: { id: holdId },
      data: { releasedAt: new Date(), releasedByAdminId: admin.id },
    }),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: "PAYOUT_HOLD_RELEASED",
        targetType: hold.bookingId ? "Booking" : "User",
        targetId: (hold.bookingId ?? hold.hostUserId)!,
      },
    }),
  ]);

  const notifyHostId = hold.hostUserId ?? hold.booking?.listing.hostId;
  if (notifyHostId) await notify(notifyHostId, "PAYOUT_HOLD_RELEASED", {});
}
