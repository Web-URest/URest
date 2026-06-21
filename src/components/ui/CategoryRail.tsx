import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/**
 * CategoryRail — horizontal scroll rail of region/category chips (v3, AirBnB pattern).
 * Active item = brand underline (NOT a filled pill — that's AmenityChip). Pattaya-first
 * ordering is the caller's concern. Consumers pass already-translated labels.
 */
export interface CategoryRailItem {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export function CategoryRail({
  items,
  activeKey,
  hrefFor,
  className = "",
}: {
  items: CategoryRailItem[];
  activeKey?: string;
  hrefFor: (key: string) => string;
  className?: string;
}) {
  return (
    <nav
      className={`flex gap-6 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {items.map((it) => {
        const active = it.key === activeKey;
        return (
          <Link
            key={it.key}
            href={hrefFor(it.key)}
            className={`group flex shrink-0 flex-col items-center gap-1.5 border-b-2 pb-2 text-sm transition duration-150 ease-out ${
              active
                ? "border-brand-500 font-semibold text-ink-900"
                : "border-transparent text-ink-500 hover:border-border hover:text-ink-900"
            }`}
          >
            {it.icon ? <span className="text-xl">{it.icon}</span> : null}
            <span className="whitespace-nowrap">
              {it.label}
              {it.count != null ? (
                <span className="ml-1 text-xs text-ink-500">({it.count})</span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
