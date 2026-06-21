"use client";

import { Search, Heart, Briefcase, MessageSquare, User } from "lucide-react";

import { Link, usePathname } from "@/i18n/navigation";

/**
 * BottomTabBar — AirBnB mobile bottom nav (v3). md:hidden, fixed bottom, safe-area aware
 * (z-lane 45, below sheets/modals). Active tab = rose. Hidden on the admin console
 * (its own chrome). Drives the --space-bottomtab inset (set in globals.css media query).
 * Consumers pass translated labels.
 */
export interface BottomTabLabels {
  search: string;
  saved: string;
  trips: string;
  messages: string;
  profile: string;
}

const TABS = [
  { key: "search", href: "/search", Icon: Search },
  { key: "saved", href: "/saved", Icon: Heart },
  { key: "trips", href: "/trips", Icon: Briefcase },
  { key: "messages", href: "/messages", Icon: MessageSquare },
  { key: "profile", href: "/profile", Icon: User },
] as const;

export function BottomTabBar({ labels }: { labels: BottomTabLabels }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <nav
      aria-label={labels.search}
      className="fixed inset-x-0 bottom-0 z-[45] flex items-stretch border-t border-border-subtle bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.map(({ key, href, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
              active ? "text-brand-500" : "text-ink-500"
            }`}
          >
            <Icon size={20} />
            {labels[key]}
          </Link>
        );
      })}
    </nav>
  );
}
