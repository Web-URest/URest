"use client";

/**
 * ListingSwitcher — villa-name chip row for the host calendar (PRODUCT_FLOWS §4.2:
 * "one calendar per villa, never a merged view"). Controlled single-select; the
 * selected chip carries the aqua ring. Merged multi-villa views cause block-the-
 * wrong-villa mistakes, so the switcher is the only way to change villa.
 */
export function ListingSwitcher({
  listings,
  selectedId,
  onSelect,
}: {
  listings: readonly { id: string; title: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {listings.map((l) => {
        const selected = l.id === selectedId;
        return (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(l.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition duration-150 ease-out ${
              selected
                ? "bg-aqua-500 text-ink-900 ring-2 ring-aqua-500"
                : "border border-line bg-sand-100 text-ink-900 hover:bg-sand-50"
            }`}
          >
            {l.title}
          </button>
        );
      })}
    </div>
  );
}
