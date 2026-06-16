"use client";

import { useTranslations } from "next-intl";

interface GuestStepperProps {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
}

export function GuestStepper({ value, min = 1, max, onChange }: GuestStepperProps) {
  const t = useTranslations("BookingCard");

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-ink-900/60">
        {t("guests")}
      </label>
      <div className="flex items-center justify-between rounded-input border border-line bg-sand-100 px-3 py-2">
        <button
          type="button"
          aria-label="ลดจำนวน"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-7 w-7 items-center justify-center rounded-full text-lg font-semibold text-ink-900 transition hover:bg-sand-300 disabled:opacity-30"
        >
          −
        </button>
        <span className="text-sm font-semibold text-ink-900">
          {value} {t("guestUnit")}
        </span>
        <button
          type="button"
          aria-label="เพิ่มจำนวน"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-7 w-7 items-center justify-center rounded-full text-lg font-semibold text-ink-900 transition hover:bg-sand-300 disabled:opacity-30"
        >
          +
        </button>
      </div>
      <p className="text-xs text-ink-900/50">{t("maxGuests", { count: max })}</p>
    </div>
  );
}
