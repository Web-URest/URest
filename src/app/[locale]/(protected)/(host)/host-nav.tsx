"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

/**
 * Host nav strip — the ink "back-of-house" cue (DESIGN_SPEC §4/§5.7). Active tab
 * carries the aqua underline. Booking-dependent tabs (requests/earnings/messages)
 * are Phase 3, shown disabled with a "soon" tag so the host sees what's coming.
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
    <header className="bg-ink-900 text-sand-50">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg">{t("consoleTitle")}</span>
          <Link
            href="/listings/new"
            className="rounded-full bg-aqua-500 px-4 py-1.5 text-sm font-semibold text-white transition duration-150 ease-out hover:bg-aqua-600"
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
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition duration-150 ease-out ${
                  active
                    ? "bg-sand-50 text-ink-900"
                    : "text-sand-300 hover:bg-ink-700"
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
              className="flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-semibold text-sand-300/40"
            >
              {t(`nav.${key}`)}
              <span className="rounded-full bg-ink-700 px-1.5 py-0.5 text-[10px] text-sand-300">
                {t("nav.soon")}
              </span>
            </span>
          ))}
        </nav>
      </div>
    </header>
  );
}
