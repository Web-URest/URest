import { describe, expect, it } from "vitest";

import { findSeasonOverlap, seasonsWellFormed } from "./seasons";

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

const s = (nameTh: string, start: string, end: string) => ({
  nameTh,
  startDate: utc(start),
  endDate: utc(end),
});

describe("findSeasonOverlap (inclusive bounds — mirrors GiST '[]')", () => {
  it("returns null for disjoint seasons", () => {
    const seasons = [
      s("low", "2026-03-01", "2026-06-30"),
      s("high", "2026-11-01", "2027-02-28"),
    ];
    expect(findSeasonOverlap(seasons)).toBeNull();
  });

  it("detects a clear overlap", () => {
    const seasons = [
      s("a", "2026-11-01", "2026-12-31"),
      s("b", "2026-12-15", "2027-01-15"),
    ];
    const hit = findSeasonOverlap(seasons);
    expect(hit).not.toBeNull();
    expect(hit?.[0].nameTh).toBe("a");
    expect(hit?.[1].nameTh).toBe("b");
  });

  it("treats a shared endpoint as an overlap (inclusive)", () => {
    const seasons = [
      s("a", "2026-11-01", "2026-12-01"),
      s("b", "2026-12-01", "2027-01-01"),
    ];
    expect(findSeasonOverlap(seasons)).not.toBeNull();
  });

  it("handles a single season and an empty list", () => {
    expect(findSeasonOverlap([])).toBeNull();
    expect(findSeasonOverlap([s("only", "2026-01-01", "2026-02-01")])).toBeNull();
  });
});

describe("seasonsWellFormed", () => {
  it("rejects a start after its end", () => {
    expect(seasonsWellFormed([s("bad", "2026-12-01", "2026-11-01")])).toBe(false);
  });
  it("accepts equal start/end and ordered ranges", () => {
    expect(seasonsWellFormed([s("ok", "2026-01-01", "2026-01-01")])).toBe(true);
  });
});
