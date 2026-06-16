/**
 * Cancellation refund math (PRODUCT_FLOWS §3.6) — pure, no clock, no Prisma.
 *
 * The guest's refund share depends on the snapshotted cancellation tier and how
 * many days before check-in the cancellation lands. The retained remainder is
 * split 90% host / 10% platform (§2.3). Per ADR-003 §Consequences, rounding
 * favors the guest: the refund rounds UP, so a fractional satang goes to the
 * guest, never the house. Money is integer satang (rule 1).
 */

import { CancellationTier } from "@prisma/client";

import { assertSatang } from "@/lib/money";

const HOST_RETAINED_PCT = 90; // of the retained amount; platform keeps the rest

export interface RefundBreakdown {
  refundSatang: number;
  retainedHostSatang: number;
  retainedPlatformSatang: number;
}

/** Guest refund percentage by tier × lead time (PRODUCT_FLOWS §3.6 table). */
export function guestRefundPct(tier: CancellationTier, daysBeforeCheckIn: number): number {
  if (daysBeforeCheckIn >= 14) return 100;
  switch (tier) {
    case CancellationTier.FLEXIBLE:
      return daysBeforeCheckIn >= 3 ? 100 : 50;
    case CancellationTier.MODERATE:
      if (daysBeforeCheckIn >= 7) return 100;
      return daysBeforeCheckIn >= 3 ? 50 : 0;
    case CancellationTier.STRICT:
      return daysBeforeCheckIn >= 7 ? 50 : 0;
  }
}

/** Refund satang for a percentage, rounding UP so rounding favors the guest. */
export function refundSatangForPct(totalSatang: number, pct: number): number {
  const total = assertSatang(totalSatang);
  if (pct >= 100) return total;
  if (pct <= 0) return 0;
  return Math.ceil((total * pct) / 100);
}

/** Split (total, refund) into the guest refund + the 90/10 host/platform retained shares. */
export function breakdown(totalSatang: number, refundSatang: number): RefundBreakdown {
  const total = assertSatang(totalSatang);
  const refund = assertSatang(refundSatang);
  const retained = total - refund;
  const retainedHostSatang = Math.floor((retained * HOST_RETAINED_PCT) / 100);
  return {
    refundSatang: refund,
    retainedHostSatang,
    retainedPlatformSatang: retained - retainedHostSatang,
  };
}

export interface GuestCancellationInput {
  totalSatang: number;
  tier: CancellationTier;
  daysBeforeCheckIn: number;
}

/** Full refund breakdown for a guest cancellation (PRODUCT_FLOWS §3.6). */
export function computeRefund(input: GuestCancellationInput): RefundBreakdown {
  const pct = guestRefundPct(input.tier, input.daysBeforeCheckIn);
  return breakdown(input.totalSatang, refundSatangForPct(input.totalSatang, pct));
}
