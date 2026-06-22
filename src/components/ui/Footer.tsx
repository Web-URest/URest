import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { TileStrip } from "./TileStrip";

/**
 * Footer — v3 ink footer with a trust-green hairline (TileStrip). Three columns:
 * brand + trust line, Support (legal), Explore (search/host). PDPA/ToS row at the base.
 */
export async function Footer() {
  const t = await getTranslations("Footer");
  const nav = await getTranslations("Nav");

  const linkCls =
    "text-sm text-white/70 transition duration-150 ease-out hover:text-white";

  return (
    <footer className="bg-ink-900 text-white">
      <TileStrip />
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-8 px-6 py-12 md:grid-cols-3">
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-lg font-bold">{t("col1Title")}</h3>
          <p className="max-w-[28em] text-sm text-white/70">{t("trustLine")}</p>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white/90">{t("col2Title")}</h3>
          <Link href="/privacy" className={linkCls}>{t("pdpa")}</Link>
          <Link href="/terms" className={linkCls}>{t("tos")}</Link>
          <Link href="/business-policy" className={linkCls}>{t("businessPolicy")}</Link>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-white/90">{t("col3Title")}</h3>
          <Link href="/search" className={linkCls}>{nav("search")}</Link>
          <Link href="/listings/new" className={linkCls}>{nav("becomeHost")}</Link>
        </div>
      </div>
      <div className="border-t border-ink-700">
        <div className="mx-auto flex max-w-[1180px] flex-wrap gap-x-4 gap-y-1 px-6 py-4 text-xs text-white/60">
          <Link href="/privacy" className="transition duration-150 ease-out hover:text-white">
            {t("pdpa")}
          </Link>
          <Link href="/terms" className="transition duration-150 ease-out hover:text-white">
            {t("tos")}
          </Link>
          <Link href="/business-policy" className="transition duration-150 ease-out hover:text-white">
            {t("businessPolicy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
