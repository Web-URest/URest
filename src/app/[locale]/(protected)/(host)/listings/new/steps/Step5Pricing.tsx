"use client";

import { BookingMode, CancellationTier } from "@prisma/client";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { NumberInput } from "@/components/ui/NumberInput";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { applyCommission } from "@/lib/listing/pricing";
import { findSeasonOverlap } from "@/lib/listing/seasons";
import { formatSatang } from "@/lib/money";

import type { SeasonRow } from "../wizard";
import type { StepProps } from "./types";

const CANCELLATION_TIERS = Object.values(CancellationTier);
const toSatang = (baht: number | null) => Math.round((baht ?? 0) * 100);

/** Net (after 10% commission) for a baht rate, formatted ฿ — or null if unset. */
function netLabel(baht: number | null): string | null {
  if (!baht) return null;
  return formatSatang(applyCommission(toSatang(baht)).netSatang);
}

const blankSeason = (): SeasonRow => ({
  nameTh: "",
  startDate: "",
  endDate: "",
  weekdayBaht: null,
  weekendBaht: null,
});

/** Wizard step ⑤ — rates, seasons, booking mode + live earnings preview. */
export function Step5Pricing({ data, patch, t }: StepProps) {
  function updateSeason(i: number, p: Partial<SeasonRow>) {
    patch({
      seasons: data.seasons.map((s, idx) => (idx === i ? { ...s, ...p } : s)),
    });
  }

  // Live overlap feedback — server enforces it too (DB constraint is the backstop).
  const ranges = data.seasons
    .filter((s) => s.startDate && s.endDate)
    .map((s) => ({
      nameTh: s.nameTh,
      startDate: new Date(`${s.startDate}T00:00:00.000Z`),
      endDate: new Date(`${s.endDate}T00:00:00.000Z`),
    }));
  const overlap = findSeasonOverlap(ranges) != null;

  const instant = data.bookingMode === BookingMode.INSTANT;

  return (
    <div className="flex flex-col gap-6">
      {/* Base rates + earnings preview */}
      <div className="grid grid-cols-2 gap-4">
        <NumberInput
          id="w-base-wd"
          label={t("baseWeekdayLabel")}
          prefix="฿"
          suffix={t("perNight")}
          value={data.baseWeekdayBaht}
          min={0}
          onValueChange={(v) => patch({ baseWeekdayBaht: v })}
        />
        <NumberInput
          id="w-base-we"
          label={t("baseWeekendLabel")}
          prefix="฿"
          suffix={t("perNight")}
          value={data.baseWeekendBaht}
          min={0}
          onValueChange={(v) => patch({ baseWeekendBaht: v })}
        />
      </div>
      <NumberInput
        id="w-holiday"
        label={t("holidayLabel")}
        prefix="฿"
        suffix={t("perNight")}
        value={data.holidayBaht}
        min={0}
        onValueChange={(v) => patch({ holidayBaht: v })}
      />

      <div className="rounded-input bg-aqua-100 p-4">
        <p className="font-medium text-ink-900">{t("earningsTitle")}</p>
        <p className="mb-2 text-sm text-teal-600">{t("earningsHint")}</p>
        <dl className="flex flex-col gap-1 text-sm">
          {netLabel(data.baseWeekdayBaht) && (
            <div className="flex justify-between">
              <dt className="text-ink-700">{t("earningsWeekday")}</dt>
              <dd className="font-semibold text-ink-900">
                {netLabel(data.baseWeekdayBaht)}
              </dd>
            </div>
          )}
          {netLabel(data.baseWeekendBaht) && (
            <div className="flex justify-between">
              <dt className="text-ink-700">{t("earningsWeekend")}</dt>
              <dd className="font-semibold text-ink-900">
                {netLabel(data.baseWeekendBaht)}
              </dd>
            </div>
          )}
          {netLabel(data.holidayBaht) && (
            <div className="flex justify-between">
              <dt className="text-ink-700">{t("earningsHoliday")}</dt>
              <dd className="font-semibold text-ink-900">
                {netLabel(data.holidayBaht)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberInput
          id="w-included"
          label={t("includedGuestsLabel")}
          min={1}
          value={data.includedGuests}
          onValueChange={(v) => patch({ includedGuests: v ?? 1 })}
        />
        <NumberInput
          id="w-extra-fee"
          label={t("extraGuestFeeLabel")}
          prefix="฿"
          min={0}
          value={data.extraGuestFeeBaht}
          onValueChange={(v) => patch({ extraGuestFeeBaht: v })}
        />
      </div>

      {/* Seasons */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-ink-900">
          {t("seasonsLabel")}
        </legend>
        <p className="text-sm text-ink-700">{t("seasonsHint")}</p>
        {data.seasons.map((s, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-input border border-line p-3">
            <TextInput
              id={`w-season-name-${i}`}
              label={t("seasonName")}
              value={s.nameTh}
              onChange={(e) => updateSeason(i, { nameTh: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextInput
                id={`w-season-start-${i}`}
                label={t("seasonStart")}
                type="date"
                value={s.startDate}
                onChange={(e) => updateSeason(i, { startDate: e.target.value })}
              />
              <TextInput
                id={`w-season-end-${i}`}
                label={t("seasonEnd")}
                type="date"
                value={s.endDate}
                onChange={(e) => updateSeason(i, { endDate: e.target.value })}
              />
              <NumberInput
                id={`w-season-wd-${i}`}
                label={t("seasonWeekday")}
                prefix="฿"
                min={0}
                value={s.weekdayBaht}
                onValueChange={(v) => updateSeason(i, { weekdayBaht: v })}
              />
              <NumberInput
                id={`w-season-we-${i}`}
                label={t("seasonWeekend")}
                prefix="฿"
                min={0}
                value={s.weekendBaht}
                onValueChange={(v) => updateSeason(i, { weekendBaht: v })}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                patch({ seasons: data.seasons.filter((_, idx) => idx !== i) })
              }
              className="self-start text-sm text-coral-600 underline"
            >
              {t("removeSeason")}
            </button>
          </div>
        ))}
        {overlap && <p className="text-sm text-coral-600">{t("errorSeasonOverlap")}</p>}
        <div>
          <Button
            variant="ghost"
            onClick={() => patch({ seasons: [...data.seasons, blankSeason()] })}
          >
            {t("addSeason")}
          </Button>
        </div>
      </fieldset>

      {/* Cancellation + booking mode */}
      <Select
        id="w-cancel"
        label={t("cancellationLabel")}
        value={data.cancellationTier}
        onChange={(e) => patch({ cancellationTier: e.target.value as CancellationTier })}
        options={CANCELLATION_TIERS.map((c) => ({
          value: c,
          label: t(`cancellation.${c}`),
        }))}
      />

      <RadioGroup
        label={t("bookingModeLabel")}
        name="w-mode"
        value={data.bookingMode}
        onValueChange={(v) => patch({ bookingMode: v as BookingMode })}
        options={[
          {
            value: BookingMode.REQUEST,
            label: t("bookingMode.REQUEST"),
            hint: t("bookingMode.REQUEST_HINT"),
          },
          {
            value: BookingMode.INSTANT,
            label: t("bookingMode.INSTANT"),
            hint: t("bookingMode.INSTANT_HINT"),
          },
        ]}
      />

      {instant && (
        <Checkbox
          id="w-instant-ack"
          checked={data.instantAck}
          onCheckedChange={(on) => patch({ instantAck: on })}
          label={t("instantAck")}
        />
      )}
    </div>
  );
}
