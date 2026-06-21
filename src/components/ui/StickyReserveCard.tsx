"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { buildQuote, type PricingConfig, type SeasonRate } from "@/lib/pricing/quote";
import { formatSatang } from "@/lib/money";
import { DateRangeField } from "./DateRangeField";
import { GuestStepper } from "./GuestStepper";
import { PriceBreakdown } from "./PriceBreakdown";
import { EscrowStrip } from "./EscrowStrip";
import { StarRating } from "./StarRating";
import { Button } from "./Button";

/**
 * StickyReserveCard — the AirBnB right-rail reserve widget (v3). Header shows price/night
 * + rating; dates + guests → live PriceBreakdown; CTA is ROSE for request ("send request,
 * no charge yet") and INK for instant ("charged now" = money action). Compact EscrowStrip
 * stays (trust). The quote math, satang money, and request/instant route distinction are
 * unchanged from the former BookingCard.
 */
interface StickyReserveCardProps {
  listingId: string;
  bookingMode: "REQUEST" | "INSTANT";
  maxGuests: number;
  pricingConfig: PricingConfig;
  seasons: SeasonRate[];
  holidayDates: string[];
  /** Optional AirBnB header — price/night + rating. */
  pricePerNightSatang?: number;
  perNightLabel?: string;
  avgRating?: number;
  reviewCount?: number;
}

export function StickyReserveCard({
  listingId,
  bookingMode,
  maxGuests,
  pricingConfig,
  seasons,
  holidayDates,
  pricePerNightSatang,
  perNightLabel,
  avgRating,
  reviewCount,
}: StickyReserveCardProps) {
  const t = useTranslations("BookingCard");
  const router = useRouter();
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
    <div className="flex flex-col gap-4 rounded-modal border border-border bg-white p-5 shadow-card">
      {pricePerNightSatang != null ? (
        <div className="flex items-end justify-between">
          <p className="text-ink-900">
            <span className="font-display text-xl font-bold">
              {formatSatang(pricePerNightSatang)}
            </span>
            {perNightLabel ? (
              <span className="text-sm text-ink-500"> {perNightLabel}</span>
            ) : null}
          </p>
          {avgRating != null ? (
            <StarRating
              value={avgRating}
              count={reviewCount}
              showValue
              className="text-sm"
            />
          ) : null}
        </div>
      ) : (
        <h3 className="font-display text-lg text-ink-900">{t("title")}</h3>
      )}

      <DateRangeField
        checkIn={checkIn}
        checkOut={checkOut}
        onCheckInChange={setCheckIn}
        onCheckOutChange={setCheckOut}
      />

      <GuestStepper value={guests} max={maxGuests} onChange={setGuests} />

      {quote ? (
        <>
          <div className="text-xs text-ink-500">{t("nights", { count: quote.nightCount })}</div>
          <PriceBreakdown quote={quote} />
        </>
      ) : (
        <p className="text-sm text-ink-500">{t("selectDates")}</p>
      )}

      <Button
        variant={isInstant ? "money" : "primary"}
        fullWidth
        disabled={!quote}
        onClick={() => {
          const path = isInstant ? "instant" : "request";
          router.push(`/listings/${listingId}/${path}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`);
        }}
      >
        {isInstant ? t("ctaInstant") : t("ctaRequest")}
      </Button>

      <p className="text-center text-xs text-ink-500">
        {isInstant ? t("ctaInstantCharge") : t("ctaNoCharge")}
      </p>

      <EscrowStrip variant="compact" step={1} audience="guest" />
    </div>
  );
}
