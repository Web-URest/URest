/**
 * Payout admin operations (PRODUCT_FLOWS §5.2) — the admin side of the escrow
 * money lifecycle: reconcile, the single audited account-number decryption,
 * mark-paid (RELEASABLE→PAID via lib/ledger), and manual payout holds.
 *
 * escrowState is mutated ONLY through `lib/ledger` (`payout`); this module never
 * writes a status field directly (rule 2). Holds are administrative `PayoutHold`
 * rows and leave escrow untouched (distinct from the dispute auto-freeze, #27).
 */
import { decryptField } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { invariantHolds } from "@/lib/ledger/escrow";
import { ledgerTotals } from "@/lib/ledger/apply";
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
