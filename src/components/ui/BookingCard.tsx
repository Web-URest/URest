"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { buildQuote, type PricingConfig, type SeasonRate } from "@/lib/pricing/quote";
import { DateRangeField } from "./DateRangeField";
import { GuestStepper } from "./GuestStepper";
import { PriceBreakdown } from "./PriceBreakdown";
import { EscrowStrip } from "./EscrowStrip";

interface BookingCardProps {
  listingId: string;
  bookingMode: "REQUEST" | "INSTANT";
  maxGuests: number;
  pricingConfig: PricingConfig;
  seasons: SeasonRate[];
  holidayDates: string[];
}

export function BookingCard({
  listingId: _listingId, // eslint-disable-line @typescript-eslint/no-unused-vars
  bookingMode,
  maxGuests,
  pricingConfig,
  seasons,
  holidayDates,
}: BookingCardProps) {
  const t = useTranslations("BookingCard");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(Math.min(2, maxGuests));

  const holidaySet = useMemo(() => new Set(holidayDates), [holidayDates]);

  const quote = useMemo(() => {
    if (!checkIn || !checkOut) return null;
    try {
      return buildQuote({ config: pricingConfig, seasons, holidays: holidaySet, checkIn, checkOut, guests });
    } catch {
      return null;
    }
  }, [checkIn, checkOut, guests, pricingConfig, seasons, holidaySet]);

  const isInstant = bookingMode === "INSTANT";

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-white p-5 shadow-card">
      <h3 className="font-display text-lg text-ink-900">{t("title")}</h3>

      <DateRangeField
        checkIn={checkIn}
        checkOut={checkOut}
        onCheckInChange={setCheckIn}
        onCheckOutChange={setCheckOut}
      />

      <GuestStepper value={guests} max={maxGuests} onChange={setGuests} />

      {quote ? (
        <>
          <div className="text-xs text-ink-900/50">{t("nights", { count: quote.nightCount })}</div>
          <PriceBreakdown quote={quote} />
        </>
      ) : (
        <p className="text-sm text-ink-900/50">{t("selectDates")}</p>
      )}

      <button
        type="button"
        disabled={!quote}
        className={`w-full rounded-button py-3 text-sm font-semibold transition ${
          isInstant
            ? "bg-coral-500 text-white hover:bg-coral-600 disabled:opacity-40"
            : "bg-aqua-500 text-ink-900 hover:bg-teal-600 hover:text-white disabled:opacity-40"
        }`}
      >
        {isInstant ? t("ctaInstant") : t("ctaRequest")}
      </button>

      <p className="text-center text-xs text-ink-900/50">
        {isInstant ? t("ctaInstantCharge") : t("ctaNoCharge")}
      </p>

      <EscrowStrip variant="compact" step={1} audience="guest" />
    </div>
  );
}
