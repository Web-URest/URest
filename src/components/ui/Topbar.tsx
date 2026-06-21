import { getTranslations } from "next-intl/server";
import { Search } from "lucide-react";

import { auth } from "@/lib/auth/auth";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { UserMenu } from "./UserMenu";

/**
 * TopbarShell — AirBnB header (v3): logo (rose dot) · compact search pill → /search ·
 * right cluster (Become-a-host, LocaleSwitcher, UserMenu account menu). The full
 * interactive PillSearchBar lives in the landing hero + the /search sub-header; the
 * floating concierge FAB replaces the old "AI" nav item. Exported separately so
 * /styleguide can render mock logged-in/out states.
 */
export type TopbarUser = {
  name?: string | null;
  image?: string | null;
};

export async function TopbarShell({ user }: { user: TopbarUser | null }) {
  const t = await getTranslations("Nav");

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-white">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-4 md:px-6">
        <Link
          href="/"
          className="shrink-0 font-display text-xl font-bold leading-none text-ink-900 transition duration-150 ease-out hover:opacity-80"
        >
          U<span className="text-brand-500">·</span>Rest
        </Link>

        {/* Compact search pill → /search (the interactive PillSearchBar lives on hero/search) */}
        <Link
          href="/search"
          className="mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-pill border border-border bg-white py-2 pl-5 pr-2 shadow-card transition duration-150 ease-out hover:shadow-raised"
        >
          <span className="truncate text-sm font-semibold text-ink-700">
            {t("searchPlaceholder")}
          </span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
            <Search size={16} />
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/host/new"
            className="hidden rounded-pill px-3 py-2 text-sm font-semibold text-ink-900 transition duration-150 ease-out hover:bg-surface-50 md:inline-block"
          >
            {t("becomeHost")}
          </Link>
          <LocaleSwitcher />
          <UserMenu
            user={user}
            labels={{
              menu: t("menu"),
              signIn: t("signIn"),
              signUp: t("signUp"),
              signOut: t("signOut"),
              trips: t("trips"),
              saved: t("saved"),
              messages: t("messages"),
              profile: t("profile"),
              becomeHost: t("becomeHost"),
            }}
          />
        </div>
      </div>
    </header>
  );
}

/** Async wrapper — fetches live session. */
export async function Topbar() {
  const session = await auth();
  return <TopbarShell user={session?.user ?? null} />;
}
