/**
 * AmenityChip — a single amenity / facet chip (v3). Static (neutral surface) on cards
 * and listings; `selected` (brand tint) when used as a filter facet. Distinct from
 * CategoryRail (which uses an underline, not a filled chip).
 */
export function AmenityChip({
  label,
  selected = false,
  className = "",
}: {
  label: string;
  selected?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${
        selected
          ? "bg-brand-50 font-semibold text-brand-700"
          : "bg-surface-50 text-ink-700"
      } ${className}`}
    >
      {label}
    </span>
  );
}
