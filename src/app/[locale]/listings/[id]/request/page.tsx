import { getLocale, getTranslations } from "next-intl/server";

import { PriceBreakdown } from "@/components/ui/PriceBreakdown";
import { redirect } from "@/i18n/navigation";
import { getListingDetail } from "@/lib/listing/queries";
import { buildQuote } from "@/lib/pricing/quote";

import { RequestForm } from "./request-form";

/**
 * Request-confirm screen (PRODUCT_FLOWS §3.2 step 1). Re-computes the quote for
 * display from the same loader the action uses, so the price shown matches the
 * snapshot the action takes on submit (ADR-011).
 */
export default async function RequestPage({
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
  if (!detail || detail.listing.bookingMode !== "REQUEST" || !checkIn || !checkOut || !guests) {
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
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-6 bg-sand-50 px-4 py-8 md:px-6">
      <h1 className="font-display text-2xl text-ink-900">{t("requestTitle")}</h1>
      <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-5 shadow-card">
        <h2 className="font-display text-lg text-ink-900">{listing.title}</h2>
        <PriceBreakdown quote={quote} />
      </div>
      <RequestForm listingId={id} checkIn={checkIn} checkOut={checkOut} guests={guests} />
    </main>
  );
}
