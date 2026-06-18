import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth/auth";
import { getListingDetail } from "@/lib/listing/queries";
import { getSavedVillaIds } from "@/lib/savedVilla";
import { formatSatang } from "@/lib/money";
import { ListingGallery } from "@/components/ui/ListingGallery";
import { BookingCard } from "@/components/ui/BookingCard";
import { FaqSection } from "@/components/ui/FaqSection";
import { HeartButton } from "@/components/ui/HeartButton";
import { PriceCalendar } from "@/components/ui/PriceCalendar";
import { EscrowStrip } from "@/components/ui/EscrowStrip";
import { StarRating } from "@/components/ui/StarRating";
import { Link } from "@/i18n/navigation";

import { FlagReviewButton } from "./flag-review-button";

interface ListingPageProps {
  params: Promise<{ id: string; locale: string }>;
}

const AMENITY_LABELS: Record<string, string> = {
  PRIVATE_POOL: "สระว่ายน้ำส่วนตัว",
  KARAOKE: "คาราโอเกะ",
  BBQ: "BBQ",
  PET_FRIENDLY: "สัตว์เลี้ยงได้",
  POOL_SLIDE: "สไลเดอร์",
  KITCHEN: "ครัว",
  PARKING: "ที่จอดรถ",
  WIFI: "Wi-Fi",
  POOL_TABLE: "โต๊ะบิลเลียด",
  NETFLIX: "Netflix",
  WHEELCHAIR_ACCESS: "Wheelchair access",
};

export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  const t = await getTranslations("ListingDetail");
  const tBook = await getTranslations("BookingCard");
  const tReviews = await getTranslations("Reviews");

  const [session, data] = await Promise.all([auth(), getListingDetail(id)]);
  if (!data) notFound();

  const savedIds = session?.user?.id
    ? await getSavedVillaIds(session.user.id, [id])
    : new Set<string>();
  const isSaved = savedIds.has(id);

  const { listing, holidaySet, attractions, reviews } = data;
  const reviewSummary = reviews.summary;

  const pricingConfig = {
    baseWeekdaySatang: listing.baseWeekdaySatang,
    baseWeekendSatang: listing.baseWeekendSatang,
    holidaySatang: listing.holidaySatang,
    includedGuests: listing.includedGuests,
    extraGuestFeeSatang: listing.extraGuestFeeSatang,
  };

  const seasons = listing.seasons.map((s: { startDate: Date; endDate: Date; weekdaySatang: number; weekendSatang: number; nameTh: string }) => ({
    startDate: s.startDate.toISOString().slice(0, 10),
    endDate: s.endDate.toISOString().slice(0, 10),
    weekdaySatang: s.weekdaySatang,
    weekendSatang: s.weekendSatang,
    nameTh: s.nameTh,
  }));

  const holidayDates = Array.from(holidaySet) as string[];

  const isInstant = listing.bookingMode === "INSTANT";

  return (
    <main className="min-h-screen bg-sand-50">
      {/* Gallery */}
      <div className="mx-auto max-w-[1120px] px-4 pt-4 md:px-6">
        <ListingGallery photos={listing.photos} title={listing.title} />
      </div>

      <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-6">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          {/* Main content */}
          <div className="flex-1 flex flex-col gap-8">
            {/* Title block */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {listing.legalBadgeAt && (
                    <span className="rounded-full bg-jade-500/10 px-2.5 py-0.5 text-xs font-semibold text-jade-500">
                      {t("legalBadge")} ✓
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      isInstant
                        ? "bg-aqua-100 text-teal-600"
                        : "bg-sand-100 text-ink-900/60"
                    }`}
                  >
                    {isInstant ? t("bookingModeInstant") : t("bookingModeRequest")}
                  </span>
                </div>
                <HeartButton
                  listingId={listing.id}
                  initialSaved={isSaved}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-100 text-lg transition-opacity"
                />
              </div>

              <h1 className="font-display text-2xl text-ink-900 md:text-3xl">
                {listing.title}
              </h1>

              <p className="text-sm text-ink-900/60">
                <Link
                  href={`/search?region=${listing.region.slug}`}
                  className="underline hover:text-teal-600"
                >
                  {listing.region.nameTh}
                </Link>{" "}
                · {t("sleeps", { count: listing.maxGuests })} ·{" "}
                {t("bedrooms", { count: listing.bedrooms })} ·{" "}
                {t("baths", { count: listing.baths })}
                {listing.poolLengthM && listing.poolWidthM && listing.poolDepthM ? (
                  <>
                    {" · "}
                    {t("poolSize", {
                      l: listing.poolLengthM.toString(),
                      w: listing.poolWidthM.toString(),
                      d: listing.poolDepthM.toString(),
                    })}
                  </>
                ) : null}
              </p>

              {listing.reviewCount > 0 && listing.avgRating !== null && (
                <StarRating value={listing.avgRating} count={listing.reviewCount} />
              )}

              <p className="text-sm leading-relaxed text-ink-700">{listing.description}</p>
            </div>

            {/* Host snippet */}
            <div className="flex items-center gap-3 rounded-card border border-line bg-white px-5 py-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-aqua-100 font-display text-xl text-teal-600">
                {listing.host.displayName?.[0] ?? "H"}
              </div>
              <div>
                <p className="font-semibold text-ink-900">{listing.host.displayName ?? t("hostTitle")}</p>
                <p className="text-xs text-ink-900/50">{t("hostResponseTime")}</p>
              </div>
            </div>

            {/* Amenities */}
            <section aria-label={t("sectionAmenities")}>
              <h2 className="mb-3 font-display text-xl text-ink-900">{t("sectionAmenities")}</h2>
              <div className="flex flex-wrap gap-2">
                {(listing.amenities as string[]).map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-sand-100 px-3 py-1.5 text-sm text-ink-700"
                  >
                    {AMENITY_LABELS[a] ?? a}
                  </span>
                ))}
              </div>
            </section>

            {/* House rules */}
            <section aria-label={t("sectionRules")}>
              <h2 className="mb-3 font-display text-xl text-ink-900">{t("sectionRules")}</h2>
              <div className="flex flex-col gap-2 rounded-card border border-line bg-white px-5 py-4 text-sm">
                <p className="font-semibold text-ink-900">
                  {listing.partyPolicy === "ALLOWED"
                    ? t("partyAllowed")
                    : listing.partyPolicy === "ASK_FIRST"
                      ? t("partyAskFirst")
                      : t("partyForbidden")}
                </p>
                {listing.quietHoursStart && listing.quietHoursEnd && (
                  <p className="text-ink-700">
                    {t("quietHours", {
                      start: listing.quietHoursStart,
                      end: listing.quietHoursEnd,
                    })}
                  </p>
                )}
                <p className="text-ink-700">
                  {t("checkInTime", { time: listing.checkInTime })}
                  {" · "}
                  {t("checkOutTime", { time: listing.checkOutTime })}
                </p>
                {listing.cashDepositSatang > 0 && (
                  <p className="rounded-md bg-coral-500/10 px-3 py-2 font-semibold text-coral-600">
                    {t("depositNote", {
                      amount: formatSatang(listing.cashDepositSatang).replace("฿", ""),
                    })}
                  </p>
                )}
              </div>
            </section>

            {/* Availability calendar */}
            <PriceCalendar calendarBlocks={listing.calendarBlocks} />

            {/* Nearby attractions */}
            {attractions.length > 0 && (
              <section aria-label={t("sectionAttractions")}>
                <h2 className="mb-3 font-display text-xl text-ink-900">{t("sectionAttractions")}</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(attractions as { id: string; nameTh: string; descTh: string; category: string; distKm: number | null }[]).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-3 rounded-card border border-line bg-white px-4 py-3"
                    >
                      <span className="mt-0.5 text-lg">
                        {a.category === "BEACH" ? "🏖" : a.category === "FOOD" ? "🍜" : a.category === "SHOPPING" ? "🛍" : "🎯"}
                      </span>
                      <div>
                        <p className="font-semibold text-ink-900">{a.nameTh}</p>
                        <p className="text-xs text-ink-900/60">{a.descTh}</p>
                        {a.distKm !== null && (
                          <p className="mt-0.5 text-xs text-teal-600">
                            {a.distKm < 1
                              ? t("distanceM", { m: Math.round(a.distKm * 1000) })
                              : t("distanceKm", { km: a.distKm.toFixed(1) })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Reviews */}
            <section aria-label={t("sectionReviews")}>
              <h2 className="mb-3 font-display text-xl text-ink-900">{t("sectionReviews")}</h2>
              {reviews.reviews.length === 0 ? (
                <div className="rounded-card border border-line bg-white px-5 py-8 text-center text-sm text-ink-900/50">
                  {t("reviewsEmpty")}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Summary: overall + sub-score averages */}
                  <div className="rounded-card border border-line bg-white p-5">
                    <div className="flex items-center gap-3">
                      <span className="font-display text-3xl text-ink-900">
                        {(reviewSummary.avgRating ?? 0).toFixed(1)}
                      </span>
                      <StarRating value={reviewSummary.avgRating ?? 0} count={reviewSummary.reviewCount} showValue={false} />
                    </div>
                    {reviewSummary.subScores && (
                      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                        {(
                          [
                            ["cleanliness", reviewSummary.subScores.cleanliness],
                            ["accuracyToPhotos", reviewSummary.subScores.accuracyToPhotos],
                            ["hostResponsiveness", reviewSummary.subScores.hostResponsiveness],
                            ["valueForMoney", reviewSummary.subScores.valueForMoney],
                          ] as const
                        ).map(([key, val]) => (
                          <div key={key} className="flex items-center justify-between gap-3">
                            <dt className="text-sm text-ink-900/70">{tReviews(key)}</dt>
                            <dd>
                              <StarRating value={val} showValue={false} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>

                  {/* Individual reviews */}
                  {reviews.reviews.map((r) => (
                    <div key={r.id} className="rounded-card border border-line bg-white p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink-900">{r.authorName}</span>
                        {r.verified && (
                          <span className="rounded-full bg-jade-500/10 px-2 py-0.5 text-xs font-semibold text-jade-500">
                            {t("verifiedGuest")} ✓
                          </span>
                        )}
                      </div>
                      <div className="mt-1">
                        <StarRating value={r.overall} showValue={false} />
                      </div>
                      {r.text && <p className="mt-2 text-sm text-ink-900/80">{r.text}</p>}
                      {r.photoUrls.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {r.photoUrls.map((u) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={u} src={u} alt="" className="aspect-square w-full rounded-photo object-cover" />
                          ))}
                        </div>
                      )}
                      <div className="mt-3">
                        <FlagReviewButton reviewId={r.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Cancellation policy */}
            <section aria-label={t("sectionCancellation")}>
              <h2 className="mb-3 font-display text-xl text-ink-900">{t("sectionCancellation")}</h2>
              <div className="rounded-card border border-line bg-white px-5 py-4 text-sm text-ink-700">
                {listing.cancellationTier === "FLEXIBLE"
                  ? t("cancellationFlexible")
                  : listing.cancellationTier === "MODERATE"
                    ? t("cancellationModerate")
                    : t("cancellationStrict")}
              </div>
            </section>

            {/* FAQ */}
            <FaqSection entries={listing.faqEntries} />

            {/* Concierge chip */}
            <button
              type="button"
              className="self-start rounded-full border border-teal-600 px-4 py-2 text-sm font-semibold text-teal-600 transition hover:bg-aqua-100"
            >
              💬 {t("conciergeChip")}
            </button>

            {/* Report link */}
            <p className="text-xs text-ink-900/40">
              <button type="button" className="underline hover:text-ink-700">
                {t("reportLink")}
              </button>
            </p>
          </div>

          {/* Desktop booking card — sticky right column */}
          <div className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[360px]">
            <BookingCard
              listingId={listing.id}
              bookingMode={listing.bookingMode}
              maxGuests={listing.maxGuests}
              pricingConfig={pricingConfig}
              seasons={seasons}
              holidayDates={holidayDates}
            />
          </div>
        </div>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="font-display text-lg text-ink-900">
              {formatSatang(listing.baseWeekdaySatang)}
            </span>
            <span className="text-sm text-ink-900/60"> {tBook("perNight")}</span>
          </div>
          <button
            type="button"
            className={`rounded-button px-5 py-2.5 text-sm font-semibold ${
              isInstant
                ? "bg-coral-500 text-white"
                : "bg-aqua-500 text-ink-900"
            }`}
          >
            {isInstant ? tBook("ctaInstant") : tBook("ctaRequest")}
          </button>
        </div>
      </div>

      {/* Escrow strip at page bottom */}
      <div className="mx-auto max-w-[1120px] px-4 pb-24 md:px-6 lg:pb-8">
        <EscrowStrip variant="full" step={1} audience="guest" />
      </div>
    </main>
  );
}
