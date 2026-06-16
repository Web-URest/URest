import { useTranslations } from "next-intl";
import { formatSatang } from "@/lib/money";
import type { Quote } from "@/lib/pricing/quote";

interface PriceBreakdownProps {
  quote: Quote;
}

const NIGHT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
};

export function PriceBreakdown({ quote }: PriceBreakdownProps) {
  const t = useTranslations("BookingCard");

  return (
    <div className="flex flex-col gap-1 text-sm">
      {quote.nights.map((n) => {
        const label =
          n.rule === "HOLIDAY"
            ? t("ruleHoliday")
            : n.rule === "SEASON"
              ? t("ruleSeason", { name: n.seasonNameTh ?? "" })
              : n.dayKind === "WEEKEND"
                ? t("ruleWeekend")
                : t("ruleBase");
        const dateStr = new Date(n.date + "T00:00:00").toLocaleDateString("th-TH", NIGHT_DATE_OPTS);
        return (
          <div key={n.date} className="flex items-center justify-between gap-2">
            <span className="text-ink-900/70">
              {dateStr}{" "}
              <span className="rounded bg-sand-100 px-1.5 py-0.5 text-xs font-medium text-ink-700">
                {label}
              </span>
            </span>
            <span className="font-medium text-ink-900">{formatSatang(n.rateSatang)}</span>
          </div>
        );
      })}

      {quote.extraGuestFeeSatang > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-line pt-1">
          <span className="text-ink-900/70">
            {t("extraGuestFee", {
              extra: quote.guests - quote.nights.length,
              nights: quote.nightCount,
            })}
          </span>
          <span className="font-medium text-ink-900">
            {formatSatang(quote.extraGuestFeeSatang)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-2 font-semibold text-ink-900">
        <span>{t("subtotal")}</span>
        <span className="font-display text-lg">{formatSatang(quote.totalSatang)}</span>
      </div>
    </div>
  );
}
