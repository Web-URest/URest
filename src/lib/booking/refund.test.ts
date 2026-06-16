import { CancellationTier } from "@prisma/client";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { breakdown, computeRefund, guestRefundPct, refundSatangForPct } from "./refund";

const { FLEXIBLE, MODERATE, STRICT } = CancellationTier;

describe("guestRefundPct — the §3.6 tier table", () => {
  it.each([
    // tier, days, expected %
    [FLEXIBLE, 20, 100],
    [FLEXIBLE, 10, 100],
    [FLEXIBLE, 5, 100],
    [FLEXIBLE, 2, 50],
    [MODERATE, 20, 100],
    [MODERATE, 10, 100],
    [MODERATE, 5, 50],
    [MODERATE, 1, 0],
    [STRICT, 20, 100],
    [STRICT, 10, 50],
    [STRICT, 5, 0],
    [STRICT, 0, 0],
  ])("%s at %i days → %i%%", (tier, days, expected) => {
    expect(guestRefundPct(tier, days)).toBe(expected);
  });
});

describe("computeRefund", () => {
  it("refunds the full amount when ≥14 days out, regardless of tier", () => {
    const r = computeRefund({ totalSatang: 12_345_00, tier: STRICT, daysBeforeCheckIn: 14 });
    expect(r.refundSatang).toBe(12_345_00);
    expect(r.retainedHostSatang).toBe(0);
    expect(r.retainedPlatformSatang).toBe(0);
  });

  it("splits a 50% refund and retains the rest 90/10 host/platform", () => {
    // 10,000 baht total, 50% → 5,000 refund; retained 5,000 → 4,500 host / 500 platform.
    const r = computeRefund({ totalSatang: 10_000_00, tier: MODERATE, daysBeforeCheckIn: 5 });
    expect(r.refundSatang).toBe(5_000_00);
    expect(r.retainedHostSatang).toBe(4_500_00);
    expect(r.retainedPlatformSatang).toBe(500_00);
  });

  it("rounds a fractional refund up — in the guest's favor", () => {
    // 50% of an odd satang total: guest gets the rounding.
    expect(refundSatangForPct(101, 50)).toBe(51); // ceil(50.5)
    const r = breakdown(101, 51);
    expect(r.refundSatang).toBe(51);
    expect(r.retainedHostSatang + r.retainedPlatformSatang).toBe(50);
  });
});

describe("refund breakdown — properties", () => {
  it("conserves money and never disadvantages the guest", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50_000_000 }),
        fc.constantFrom(FLEXIBLE, MODERATE, STRICT),
        fc.integer({ min: 0, max: 60 }),
        (totalSatang, tier, daysBeforeCheckIn) => {
          const r = computeRefund({ totalSatang, tier, daysBeforeCheckIn });

          // Nothing created or destroyed.
          expect(r.refundSatang + r.retainedHostSatang + r.retainedPlatformSatang).toBe(totalSatang);
          // Each share is a non-negative integer satang.
          expect(Number.isInteger(r.refundSatang)).toBe(true);
          expect(r.refundSatang).toBeGreaterThanOrEqual(0);
          expect(r.retainedHostSatang).toBeGreaterThanOrEqual(0);
          expect(r.retainedPlatformSatang).toBeGreaterThanOrEqual(0);

          // Rounding favors the guest: refund is at least the exact share.
          const pct = guestRefundPct(tier, daysBeforeCheckIn);
          expect(r.refundSatang).toBeGreaterThanOrEqual(Math.floor((totalSatang * pct) / 100));
        },
      ),
    );
  });
});
