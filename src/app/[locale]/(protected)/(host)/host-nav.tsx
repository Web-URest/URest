"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

/**
 * Host nav strip — v3 light AirBnB-host chrome (supersedes the ink §4/§5.7 cue;
 * the back-of-house boundary is now the distinct nav, not darkness). Active tab is
 * rose-tinted. Booking-dependent tabs (earnings) are Phase 3, shown disabled with a
 * "soon" tag.
 */
const TABS = [
  { href: "/dashboard", key: "overview" as const },
  { href: "/calendar", key: "calendar" as const },
  { href: "/requests", key: "requests" as const },
  { href: "/bookings", key: "bookings" as const },
  { href: "/messages", key: "messages" as const },
];

const SOON_TABS = ["earnings"] as const;

export function HostNav() {
  const t = useTranslations("Host");
  const pathname = usePathname();

  return (
    <header className="border-b border-border-subtle bg-white">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-bold text-ink-900">
            {t("consoleTitle")}
          </span>
          <Link
            href="/listings/new"
            className="rounded-pill bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white transition duration-150 ease-out hover:bg-brand-600"
          >
            {t("createListing")}
          </Link>
        </div>
        <nav aria-label={t("consoleTitle")} className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-pill px-4 py-1.5 text-sm font-semibold transition duration-150 ease-out ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-700 hover:bg-surface-50"
                }`}
              >
                {t(`nav.${tab.key}`)}
              </Link>
            );
          })}
          {SOON_TABS.map((key) => (
            <span
              key={key}
              aria-disabled
              className="flex items-center gap-1 rounded-pill px-4 py-1.5 text-sm font-semibold text-ink-500/50"
            >
              {t(`nav.${key}`)}
              <span className="rounded-full bg-surface-100 px-1.5 py-0.5 text-[10px] text-ink-500">
                {t("nav.soon")}
              </span>
            </span>
          ))}
        </nav>
      </div>
    </header>
  );
}
