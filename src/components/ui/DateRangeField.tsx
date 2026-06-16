"use client";

import { useTranslations } from "next-intl";

interface DateRangeFieldProps {
  checkIn: string;
  checkOut: string;
  onCheckInChange: (v: string) => void;
  onCheckOutChange: (v: string) => void;
  minDate?: string;
}

export function DateRangeField({
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
  minDate,
}: DateRangeFieldProps) {
  const t = useTranslations("BookingCard");
  const today = minDate ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-input border border-line bg-line">
      <div className="flex flex-col gap-1 bg-sand-100 px-3 py-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-900/60">
          {t("checkIn")}
        </label>
        <input
          type="date"
          value={checkIn}
          min={today}
          onChange={(e) => {
            onCheckInChange(e.target.value);
            if (checkOut && e.target.value >= checkOut) {
              onCheckOutChange("");
            }
          }}
          className="bg-transparent text-sm font-semibold text-ink-900 outline-none"
        />
      </div>
      <div className="flex flex-col gap-1 bg-sand-100 px-3 py-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-ink-900/60">
          {t("checkOut")}
        </label>
        <input
          type="date"
          value={checkOut}
          min={checkIn || today}
          onChange={(e) => onCheckOutChange(e.target.value)}
          className="bg-transparent text-sm font-semibold text-ink-900 outline-none"
        />
      </div>
    </div>
  );
}
