/**
 * Season overlap detection (PRODUCT_FLOWS §4.1 ⑤).
 *
 * The DB has the last word: a GiST exclusion constraint (`season_no_overlap`,
 * see prisma migration + docs/DATA_MODEL.md constraint №2) makes overlapping
 * seasons impossible at write time. This module is the *friendly* pre-check that
 * gives the host a readable error before that constraint ever fires — it mirrors
 * the constraint's inclusive (`'[]'`) range semantics: two seasons sharing an
 * endpoint count as an overlap.
 */

export interface SeasonRange {
  /** Optional label so callers can surface which season conflicts. */
  nameTh?: string;
  startDate: Date;
  endDate: Date;
}

/** Inclusive-bounds overlap: ranges touching at an endpoint conflict. */
function rangesOverlap(a: SeasonRange, b: SeasonRange): boolean {
  return a.startDate.getTime() <= b.endDate.getTime() &&
    b.startDate.getTime() <= a.endDate.getTime();
}

/**
 * First conflicting pair, or null if all seasons are disjoint. Also treats a
 * season whose start is after its end as invalid (returns it paired with itself).
 */
export function findSeasonOverlap<T extends SeasonRange>(
  seasons: readonly T[],
): [T, T] | null {
  for (let i = 0; i < seasons.length; i++) {
    const a = seasons[i];
    if (!a) continue;
    for (let j = i + 1; j < seasons.length; j++) {
      const b = seasons[j];
      if (!b) continue;
      if (rangesOverlap(a, b)) return [a, b];
    }
  }
  return null;
}

/** True when every range starts on or before it ends. */
export function seasonsWellFormed(seasons: readonly SeasonRange[]): boolean {
  return seasons.every((s) => s.startDate.getTime() <= s.endDate.getTime());
}
