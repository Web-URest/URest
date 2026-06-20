import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { TileStrip } from "./TileStrip";

/**
 * Footer — DESIGN_SPEC §4: ink-900 bg, sand text, TileStrip on top edge, 3 columns + PDPA/ToS.
 */
export async function Footer() {
  const t = await getTranslations("Footer");

  return (
    <footer className="bg-ink-900 text-sand-50">
      <TileStrip />
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-8 px-6 py-12 md:grid-cols-3">
        <div className="flex flex-col gap-3">
          <h3 className="font-display text-lg">{t("col1Title")}</h3>
          <p className="text-sm text-sand-300">{t("trustLine")}</p>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-sand-300">{t("col2Title")}</h3>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-sand-300">{t("col3Title")}</h3>
        </div>
      </div>
      <div className="border-t border-ink-700">
        <div className="mx-auto flex max-w-[1120px] flex-wrap gap-x-4 gap-y-1 px-6 py-4 text-xs text-sand-300">
          <Link href="/privacy" className="hover:text-sand-50 transition duration-150 ease-out">
            {t("pdpa")}
          </Link>
          <Link href="/terms" className="hover:text-sand-50 transition duration-150 ease-out">
            {t("tos")}
          </Link>
          <Link href="/business-policy" className="hover:text-sand-50 transition duration-150 ease-out">
            {t("businessPolicy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
