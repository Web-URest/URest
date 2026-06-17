"use client";

import { CancellationTier } from "@prisma/client";

import { BookingModeToggle } from "@/components/ui/BookingModeToggle";
import { NumberInput } from "@/components/ui/NumberInput";
import { SeasonEditor } from "@/components/ui/SeasonEditor";
import { Select } from "@/components/ui/Select";
import { buildQuote } from "@/lib/pricing/quote";
import { formatSatang } from "@/lib/money";

import type { StepProps } from "./types";

const CANCELLATION_TIERS = Object.values(CancellationTier);
const toSatang = (baht: number | null) => Math.round((baht ?? 0) * 100);

/**
 * Net host earnings (after 10% commission) for a single night at `rateSatang`,
 * via the canonical pricing engine (`@/lib/pricing/quote`) — never a local 10%
 * calc. A one-night quote isolates the rate; commission is day-independent.
 */
function netLabel(baht: number | null): string | null {
  if (!baht) return null;
  const rateSatang = toSatang(baht);
  const { hostEarningsSatang } = buildQuote({
    config: {
      baseWeekdaySatang: rateSatang,
      baseWeekendSatang: rateSatang,
      holidaySatang: null,
      includedGuests: 1,
      extraGuestFeeSatang: 0,
    },
    seasons: [],
    holidays: new Set(),
    checkIn: "2026-01-05", // any single weekday→weekday night; commission is day-agnostic
    checkOut: "2026-01-06",
    guests: 1,
  });
  return formatSatang(hostEarningsSatang);
}

/** Wizard step ⑤ — rates, seasons, booking mode + live earnings preview. */
export function Step5Pricing({ data, patch, t }: StepProps) {
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

      {/* Seasons — shared editor (also used on the Edit Villa page) */}
      <SeasonEditor
        seasons={data.seasons}
        onChange={(seasons) => patch({ seasons })}
        idPrefix="w-season"
      />

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

      <BookingModeToggle
        mode={data.bookingMode}
        onModeChange={(mode) => patch({ bookingMode: mode })}
        ack={data.instantAck}
        onAckChange={(instantAck) => patch({ instantAck })}
      />
    </div>
  );
}
