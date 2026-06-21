"use client";

import { Link, usePathname } from "@/i18n/navigation";

/**
 * AdminSidebar — vertical grouped nav for the light admin console (v3). Replaces the
 * horizontal ink <nav>. Active item gets a rose left-border + rose-tinted bg. Collapses
 * to a horizontal scroll strip under md. Consumers pass translated group + item labels.
 */
export interface AdminNavItem {
  href: string;
  label: string;
}
export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export function AdminSidebar({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="md:w-56 md:shrink-0">
      <div className="flex gap-1 overflow-x-auto md:flex-col md:gap-4 md:overflow-visible">
        {groups.map((g) => (
          <div key={g.label} className="md:space-y-1">
            <p className="hidden px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-500 md:block">
              {g.label}
            </p>
            <div className="flex gap-1 md:flex-col">
              {g.items.map((it) => {
                const active = isActive(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={`whitespace-nowrap rounded-input border-l-2 px-3 py-2 text-sm transition duration-150 ease-out ${
                      active
                        ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                        : "border-transparent text-ink-700 hover:bg-surface-50 hover:text-ink-900"
                    }`}
                  >
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
