/**
 * Payout admin operations (PRODUCT_FLOWS §5.2) — the admin side of the escrow
 * money lifecycle: reconcile, the single audited account-number decryption,
 * mark-paid (RELEASABLE→PAID via lib/ledger), and manual payout holds.
 *
 * escrowState is mutated ONLY through `lib/ledger` (`payout`); this module never
 * writes a status field directly (rule 2). Holds are administrative `PayoutHold`
 * rows and leave escrow untouched (distinct from the dispute auto-freeze, #27).
 */
import { invariantHolds } from "@/lib/ledger/escrow";
import { ledgerTotals } from "@/lib/ledger/apply";
import { getBalance } from "@/lib/payments/opn";

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
