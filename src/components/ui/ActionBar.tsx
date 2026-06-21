import type { ReactNode } from "react";

/**
 * ActionBar — sticky mobile bottom action bar (v3): price + primary CTA on listing /
 * checkout / wizard. Hidden ≥ md (those use the StickyReserveCard / inline CTA). Sits
 * above the BottomTabBar via the z-lane; safe-area aware. Presentational.
 */
export function ActionBar({
  priceSlot,
  ctaSlot,
  note,
}: {
  priceSlot: ReactNode;
  ctaSlot: ReactNode;
  note?: string;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] md:hidden">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4">
        <div className="min-w-0">
          {priceSlot}
          {note ? <p className="text-xs text-ink-500">{note}</p> : null}
        </div>
        <div className="shrink-0">{ctaSlot}</div>
      </div>
    </div>
  );
}
