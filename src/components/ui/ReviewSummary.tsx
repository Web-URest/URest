import { StarRating } from "./StarRating";

/**
 * ReviewSummary — rating headline + sub-score bars (v3, AirBnB pattern). Server
 * component. Sub-score track = neutral; fill = ink (AirBnB keeps the bars dark, stars
 * amber). Consumers pass already-translated sub-score labels.
 */
export interface SubScore {
  label: string;
  /** 0–5 */
  value: number;
}

export function ReviewSummary({
  overall,
  reviewsLabel,
  subScores,
}: {
  overall: number;
  reviewsLabel: string;
  subScores: SubScore[];
}) {
  return (
    <div className="rounded-card border border-border-subtle p-5">
      <div className="flex items-center gap-3">
        <span className="font-display text-3xl font-bold text-ink-900">
          {overall.toFixed(1)}
        </span>
        <div>
          <StarRating value={overall} />
          <p className="text-sm text-ink-500">{reviewsLabel}</p>
        </div>
      </div>
      {subScores.length > 0 ? (
        <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
          {subScores.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm text-ink-700">{s.label}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-100">
                <span
                  className="block h-full rounded-full bg-ink-900"
                  style={{ width: `${Math.max(0, Math.min(100, (s.value / 5) * 100))}%` }}
                />
              </span>
              <span className="w-7 shrink-0 text-right text-sm tabular-nums text-ink-700">
                {s.value.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
