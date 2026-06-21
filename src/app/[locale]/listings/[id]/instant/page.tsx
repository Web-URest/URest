import { getLocale, getTranslations } from "next-intl/server";

import { PriceBreakdown } from "@/components/ui/PriceBreakdown";
import { EscrowStrip } from "@/components/ui/EscrowStrip";
import { redirect } from "@/i18n/navigation";
import { getListingDetail } from "@/lib/listing/queries";
import { buildQuote } from "@/lib/pricing/quote";

import { InstantForm } from "./instant-form";

/**
 * Instant-book confirm screen (PRODUCT_FLOWS §3.2 instant mode, step 1). Same
 * quote re-computation as the request screen (ADR-011 snapshot), minus the
 * note-to-host — instant has no host approval. Submit holds the dates and goes
 * straight to payment.
 */
export default async function InstantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}) {
  const [{ id }, sp, locale, t] = await Promise.all([
    params,
    searchParams,
    getLocale(),
    getTranslations("Booking"),
  ]);
  const guests = Number(sp.guests);
  const { checkIn, checkOut } = sp;

  const detail = await getListingDetail(id);
  if (!detail || detail.listing.bookingMode !== "INSTANT" || !checkIn || !checkOut || !guests) {
    redirect({ href: `/listings/${id}`, locale });
    return null;
  }

  const { listing, holidaySet } = detail;
  const quote = buildQuote({
    config: {
      baseWeekdaySatang: listing.baseWeekdaySatang,
      baseWeekendSatang: listing.baseWeekendSatang,
      holidaySatang: listing.holidaySatang,
      includedGuests: listing.includedGuests,
      extraGuestFeeSatang: listing.extraGuestFeeSatang,
    },
    seasons: listing.seasons.map((s) => ({
      startDate: s.startDate.toISOString().slice(0, 10),
      endDate: s.endDate.toISOString().slice(0, 10),
      weekdaySatang: s.weekdaySatang,
      weekendSatang: s.weekendSatang,
      nameTh: s.nameTh,
    })),
    holidays: holidaySet,
    checkIn,
    checkOut,
    guests,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-6 px-4 py-8 md:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">{t("instantTitle")}</h1>
      <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-ink-900">{listing.title}</h2>
        <PriceBreakdown quote={quote} />
      </div>
      <EscrowStrip variant="compact" step={1} audience="guest" />
      <InstantForm listingId={id} checkIn={checkIn} checkOut={checkOut} guests={guests} />
    </main>
  );
}
