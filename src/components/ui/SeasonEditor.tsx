"use client";

import { useTranslations } from "next-intl";

import { findSeasonOverlap } from "@/lib/listing/seasons";

import { Button } from "./Button";
import { NumberInput } from "./NumberInput";
import { TextInput } from "./TextInput";

/** Seasonal-pricing row in the UI (money in baht; converted to satang at save). */
export interface SeasonRow {
  nameTh: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  weekdayBaht: number | null;
  weekendBaht: number | null;
}

const blankSeason = (): SeasonRow => ({
  nameTh: "",
  startDate: "",
  endDate: "",
  weekdayBaht: null,
  weekendBaht: null,
});

/**
 * SeasonEditor — named date-range rows each with their own weekday/weekend rates
 * (PRODUCT_FLOWS §4.1 ⑤). Live overlap feedback mirrors the DB GiST backstop
 * (`findSeasonOverlap`). Shared by the listing wizard step ⑤ and the Edit Villa
 * ราคา & ซีซั่น section — strings come from the `Wizard` namespace (the canonical
 * pricing vocabulary), so both surfaces read identically.
 */
export function SeasonEditor({
  seasons,
  onChange,
  idPrefix = "season",
}: {
  seasons: SeasonRow[];
  onChange: (seasons: SeasonRow[]) => void;
  idPrefix?: string;
}) {
  const t = useTranslations("Wizard");

  function updateSeason(i: number, p: Partial<SeasonRow>) {
    onChange(seasons.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
  }

  const ranges = seasons
    .filter((s) => s.startDate && s.endDate)
    .map((s) => ({
      nameTh: s.nameTh,
      startDate: new Date(`${s.startDate}T00:00:00.000Z`),
      endDate: new Date(`${s.endDate}T00:00:00.000Z`),
    }));
  const overlap = findSeasonOverlap(ranges) != null;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium text-ink-900">{t("seasonsLabel")}</legend>
      <p className="text-sm text-ink-700">{t("seasonsHint")}</p>
      {seasons.map((s, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-input border border-line p-3">
          <TextInput
            id={`${idPrefix}-name-${i}`}
            label={t("seasonName")}
            value={s.nameTh}
            onChange={(e) => updateSeason(i, { nameTh: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              id={`${idPrefix}-start-${i}`}
              label={t("seasonStart")}
              type="date"
              value={s.startDate}
              onChange={(e) => updateSeason(i, { startDate: e.target.value })}
            />
            <TextInput
              id={`${idPrefix}-end-${i}`}
              label={t("seasonEnd")}
              type="date"
              value={s.endDate}
              onChange={(e) => updateSeason(i, { endDate: e.target.value })}
            />
            <NumberInput
              id={`${idPrefix}-wd-${i}`}
              label={t("seasonWeekday")}
              prefix="฿"
              min={0}
              value={s.weekdayBaht}
              onValueChange={(v) => updateSeason(i, { weekdayBaht: v })}
            />
            <NumberInput
              id={`${idPrefix}-we-${i}`}
              label={t("seasonWeekend")}
              prefix="฿"
              min={0}
              value={s.weekendBaht}
              onValueChange={(v) => updateSeason(i, { weekendBaht: v })}
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(seasons.filter((_, idx) => idx !== i))}
            className="self-start text-sm text-coral-600 underline"
          >
            {t("removeSeason")}
          </button>
        </div>
      ))}
      {overlap && <p className="text-sm text-coral-600">{t("errorSeasonOverlap")}</p>}
      <div>
        <Button variant="ghost" onClick={() => onChange([...seasons, blankSeason()])}>
          {t("addSeason")}
        </Button>
      </div>
    </fieldset>
  );
}
