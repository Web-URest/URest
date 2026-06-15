import { getTranslations } from "next-intl/server";
import { Heart, User, Menu } from "lucide-react";

import { auth } from "@/lib/auth/auth";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

/**
 * TopbarShell — pure rendering (DESIGN_SPEC §4: sand topbar, hairline bottom).
 * Exported separately so /styleguide can render mock logged-in/out states.
 * TODO: host/admin variant swaps bg-sand-50 → bg-ink-900 (DESIGN_SPEC §4 "back of house").
 */
export type TopbarUser = {
  name?: string | null;
  image?: string | null;
};

export async function TopbarShell({ user }: { user: TopbarUser | null }) {
  const t = await getTranslations("Nav");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-sand-50">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="font-display text-xl leading-none text-ink-900 transition duration-150 ease-out hover:opacity-80"
        >
          U<span className="text-aqua-500">·</span>Rest
        </Link>

        {/* Center nav — desktop only */}
        <nav
          aria-label={t("menu")}
          className="hidden items-center gap-6 md:flex"
        >
          <Link
            href="/search"
            className="text-sm font-semibold text-ink-700 transition duration-150 ease-out hover:text-teal-600"
          >
            {t("search")}
          </Link>
          <Link
            href="/concierge"
            className="text-sm font-semibold text-ink-700 transition duration-150 ease-out hover:text-teal-600"
          >
            {t("concierge")}
          </Link>
          <Link
            href="/host/new"
            className="text-sm font-semibold text-ink-700 transition duration-150 ease-out hover:text-teal-600"
          >
            {t("becomeHost")}
          </Link>
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          <LocaleSwitcher />

          {user ? (
            <>
              <Link
                href="/saved"
                aria-label={t("saved")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition duration-150 ease-out hover:bg-sand-100"
              >
                <Heart size={20} />
              </Link>
              <Link
                href="/profile"
                aria-label={t("profile")}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-line bg-sand-100 transition duration-150 ease-out hover:border-teal-600"
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt={user.name ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User size={18} className="text-ink-700" />
                )}
              </Link>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-full bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white transition duration-150 ease-out hover:bg-ink-700"
            >
              {t("signIn")}
            </Link>
          )}

          {/* Mobile hamburger — drawer not yet implemented; hidden from a11y until wired */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition duration-150 ease-out hover:bg-sand-100 md:hidden"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Async wrapper — fetches live session and passes to TopbarShell. */
export async function Topbar() {
  const session = await auth();
  return <TopbarShell user={session?.user ?? null} />;
}
