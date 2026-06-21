import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { isKillSwitchActive } from "@/lib/concierge/cost";
import { ConciergeChat } from "./ConciergeChat";

type Props = {
  searchParams: Promise<{ listing?: string }>;
};

export default async function ConciergePage({ searchParams }: Props) {
  const t = await getTranslations("Concierge");
  const { listing: scopedListingId } = await searchParams;

  const killSwitch = await isKillSwitchActive();

  if (killSwitch) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-display text-3xl text-ink-900">{t("restModeTitle")}</p>
        <p className="text-ink-900/60">{t("restModeSub")}</p>
        <Link
          href="/search"
          className="mt-2 inline-flex items-center justify-center rounded-full bg-aqua-500 px-6 py-3 font-semibold text-white transition hover:bg-aqua-600"
        >
          {t("restModeSearch")}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col bg-sand-100">
      {/* Ink header per DESIGN_SPEC §5.6 */}
      <header className="flex items-center gap-3 bg-ink-900 px-4 py-3">
        <span
          aria-hidden
          className="h-2.5 w-2.5 animate-pulse rounded-full bg-aqua-500"
        />
        <div>
          <p className="font-display text-base font-semibold text-white">
            {t("pageTitle")}
          </p>
          <p className="text-xs text-white/60">{t("headerSubtitle")}</p>
        </div>
      </header>

      <ConciergeChat scopedListingId={scopedListingId} />
    </main>
  );
}
