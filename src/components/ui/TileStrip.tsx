/**
 * TileStrip — pool-tile checker motif (DESIGN_SPEC §3 signature motif #1).
 *
 * An 8px-tall checkered aqua "pool tile" band. Used on the top edge of payment /
 * escrow cards, under the hero, and on the footer's top edge. Per DESIGN_SPEC:
 * never more than 2 per screen. Decorative only (aria-hidden). Tokens only.
 */
export function TileStrip({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-2 w-full ${className}`}
      style={{
        backgroundColor: "var(--color-aqua-300)",
        backgroundImage:
          "linear-gradient(45deg, var(--color-aqua-500) 25%, transparent 25%)," +
          "linear-gradient(-45deg, var(--color-aqua-500) 25%, transparent 25%)," +
          "linear-gradient(45deg, transparent 75%, var(--color-aqua-500) 75%)," +
          "linear-gradient(-45deg, transparent 75%, var(--color-aqua-500) 75%)",
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
      }}
    />
  );
}
