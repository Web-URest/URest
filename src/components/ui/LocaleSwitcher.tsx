"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition } from "react";

/**
 * Language pill — toggles between th and en while staying on the current path.
 * Client Component: needs useRouter from i18n/navigation (CLAUDE.md rule 7).
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = locale === "th" ? "en" : "th";
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      aria-label={locale === "th" ? t("switchToEn") : t("switchToTh")}
      className="flex items-center rounded-full border border-line bg-transparent px-3 py-1 text-xs font-semibold text-ink-900 transition duration-150 ease-out hover:bg-sand-100 disabled:opacity-50"
    >
      <span className={locale === "th" ? "text-ink-900" : "text-ink-700/50"}>
        TH
      </span>
      <span className="mx-1 text-line">|</span>
      <span className={locale === "en" ? "text-ink-900" : "text-ink-700/50"}>
        EN
      </span>
    </button>
  );
}
