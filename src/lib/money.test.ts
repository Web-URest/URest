import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  assertSatang,
  formatSatang,
  satangFromBaht,
  sumSatang,
} from "./money";

// This file doubles as the template for ADR-003's required property tests:
// when the ledger lands in Phase 3, the invariant
//   sum(HELD + RELEASABLE + FROZEN) = received − refunded − paid out
// gets the same fast-check treatment against generated event sequences.

describe("money (integer satang convention)", () => {
  it("formats whole-baht amounts without decimals", () => {
    expect(formatSatang(1_290_000)).toBe("฿12,900");
    expect(formatSatang(0)).toBe("฿0");
  });

  it("formats sub-baht amounts with two digits", () => {
    expect(formatSatang(1_290_050)).toBe("฿12,900.50");
    expect(formatSatang(5)).toBe("฿0.05");
  });

  it("rejects non-integer amounts everywhere", () => {
    expect(() => assertSatang(10.5)).toThrow(TypeError);
    expect(() => satangFromBaht(99.999)).toThrow(TypeError);
    expect(() => sumSatang([100, 0.5])).toThrow(TypeError);
  });

  // Property: summing is order-independent and never loses satang —
  // the micro version of the ledger invariant.
  it("sumSatang is exact and permutation-invariant", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100_000_000 })),
        (amounts) => {
          const total = sumSatang(amounts);
          const reversed = sumSatang([...amounts].reverse());
          expect(total).toBe(reversed);
          expect(Number.isSafeInteger(total)).toBe(true);
        },
      ),
    );
  });

  // Property: baht→satang→display round-trips whole-baht amounts.
  it("whole baht amounts survive conversion and formatting", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (baht) => {
        const satang = satangFromBaht(baht);
        expect(satang).toBe(baht * 100);
        expect(formatSatang(satang)).toBe(`฿${baht.toLocaleString("th-TH")}`);
      }),
    );
  });
});
