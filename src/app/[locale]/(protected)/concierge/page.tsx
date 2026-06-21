import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
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
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-display text-3xl font-bold text-ink-900">{t("restModeTitle")}</p>
        <p className="text-ink-500">{t("restModeSub")}</p>
        <Link
          href="/search"
          className="mt-2 inline-flex items-center justify-center rounded-pill bg-brand-500 px-6 py-3 font-semibold text-white transition duration-150 ease-out hover:bg-brand-600"
        >
          {t("restModeSearch")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-[calc(100dvh-4rem)] max-w-3xl flex-col">
      {/* Light branded header (v3 — supersedes the ink §5.6 header) */}
      <header className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white">
          <Sparkles size={16} />
        </span>
        <div>
          <p className="font-display text-base font-semibold text-ink-900">
            {t("pageTitle")}
          </p>
          <p className="text-xs text-ink-500">{t("headerSubtitle")}</p>
        </div>
      </header>

      <ConciergeChat scopedListingId={scopedListingId} />
    </main>
  );
}
