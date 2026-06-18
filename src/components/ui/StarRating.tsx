/**
 * Read-only star rating display (PRODUCT_FLOWS §3.4). Server-compatible — used on
 * villa cards, the listing-detail title, and review summary bars. Fractional fill
 * via an overlaid clipped gold row (no half-glyph). `gold-400` is the sanctioned
 * star token (DESIGN_SPEC §3). The interactive input lives in `StarRatingInput`.
 */
export function StarRating({
  value,
  count,
  showValue = true,
  className,
}: {
  /** 0–5, fractional allowed. */
  value: number;
  /** Optional review count → renders "(23)". */
  count?: number;
  /** Show the numeric "4.8" next to the stars. */
  showValue?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <span className="relative inline-block leading-none" aria-hidden>
        <span className="text-ink-900/15">★★★★★</span>
        <span
          className="absolute inset-0 overflow-hidden text-gold-400"
          style={{ width: `${pct}%` }}
        >
          ★★★★★
        </span>
      </span>
      {(showValue || count !== undefined) && (
        <span className="text-sm tabular-nums text-ink-900/70">
          {showValue ? value.toFixed(1) : ""}
          {count !== undefined ? ` (${count})` : ""}
        </span>
      )}
    </span>
  );
}
