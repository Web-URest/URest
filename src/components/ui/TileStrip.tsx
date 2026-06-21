/**
 * TileStrip — thin emerald accent rule (Identity v2 "Clean & Modern").
 *
 * Replaces the retired pool-tile checker motif: a clean 3px emerald top-edge
 * accent used on escrow cards and the footer. Decorative only (aria-hidden),
 * tokens only. Keeps the original API so callers are unchanged.
 */
export function TileStrip({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`h-[3px] w-full bg-aqua-500 ${className}`} />;
}
