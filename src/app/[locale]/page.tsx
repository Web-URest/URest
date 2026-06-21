import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { searchListings } from "@/lib/listing/queries";
import { VillaCard } from "@/components/ui/VillaCard";
import { EscrowStrip } from "@/components/ui/EscrowStrip";

/**
 * Landing page (Identity v2 "Clean & Modern"). Replaces the Phase-1 placeholder.
 * Trust-forward: hero → escrow explainer → verified featured villas → how it works.
 * Featured villas pull the top-rated published Pattaya listings (empty until any exist).
 */
export default async function HomePage() {
  const t = await getTranslations("Home");
  const featured = (
    await searchListings({
      regionSlug: "pattaya",
      guests: 1,
      amenities: [],
      instantOnly: false,
      sort: "rating",
    })
  ).slice(0, 6);

  return (
    <main className="bg-sand-50">
      {/* Hero */}
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-[1160px] items-center gap-12 px-6 py-16 md:grid-cols-[1.05fr_.95fr] md:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-aqua-100 px-3 py-1.5 text-sm font-semibold text-teal-600">
              <ShieldIcon className="h-4 w-4" /> {t("eyebrow")}
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight text-ink-900 md:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-5 max-w-[30em] text-lg text-ink-700">{t("subtitle")}</p>
            <p className="mt-4 flex items-center gap-2 text-sm font-medium text-teal-600">
              <ShieldIcon className="h-[18px] w-[18px]" /> {t("trustLine")}
            </p>

            {/* Search teaser → /search (the real filters live there) */}
            <Link
              href="/search"
              className="mt-7 flex max-w-[560px] items-center gap-2 rounded-2xl border border-sand-300 bg-white p-2 shadow-card transition hover:shadow-raised"
            >
              <span className="flex-1 px-4 py-1.5">
                <span className="block text-xs font-semibold text-ink-900/50">
                  {t("searchDestination")}
                </span>
                <span className="block text-sm font-medium text-ink-900">
                  {t("destinationDefault")}
                </span>
              </span>
              <span className="hidden flex-1 border-l border-line px-4 py-1.5 sm:block">
                <span className="block text-xs font-semibold text-ink-900/50">
                  {t("searchDates")}
                </span>
                <span className="block text-sm font-medium text-ink-900/60">
                  {t("searchDatesHint")}
                </span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-aqua-500 px-5 py-2.5 text-sm font-semibold text-white">
                {t("searchCta")}
              </span>
            </Link>
          </div>

          {/* Hero feature card */}
          <div>
            {featured[0] ? (
              <Link href={`/listings/${featured[0].id}`} className="block">
                <VillaCard villa={toVilla(featured[0])} />
              </Link>
            ) : (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-card border border-line bg-aqua-100 p-8 text-center">
                <ShieldIcon className="h-10 w-10 text-teal-600" />
                <p className="font-display text-xl font-semibold text-ink-900">
                  {t("trustHeading")}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Escrow trust */}
      <section className="border-b border-line bg-sand-100">
        <div className="mx-auto max-w-[1160px] px-6 py-16 md:py-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-aqua-100 px-3 py-1.5 text-sm font-semibold text-teal-600">
            <ShieldIcon className="h-4 w-4" /> {t("trustEyebrow")}
          </span>
          <h2 className="mt-3 max-w-[18em] font-display text-2xl font-bold text-ink-900 md:text-3xl">
            {t("trustHeading")}
          </h2>
          <p className="mt-3 max-w-[40em] text-ink-700">{t("trustBody")}</p>
          <div className="mt-9 max-w-[760px]">
            <EscrowStrip step={2} audience="guest" variant="full" />
          </div>
        </div>
      </section>

      {/* Featured villas */}
      {featured.length > 0 && (
        <section className="border-b border-line">
          <div className="mx-auto max-w-[1160px] px-6 py-16 md:py-20">
            <span className="text-sm font-semibold text-teal-600">
              {t("featuredEyebrow")}
            </span>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink-900 md:text-3xl">
              {t("featuredHeading")}
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((l) => (
                <Link key={l.id} href={`/listings/${l.id}`} className="block">
                  <VillaCard villa={toVilla(l)} />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="bg-sand-100">
        <div className="mx-auto max-w-[1160px] px-6 py-16 md:py-20">
          <div className="text-center">
            <span className="text-sm font-semibold text-teal-600">{t("howEyebrow")}</span>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink-900 md:text-3xl">
              {t("howHeading")}
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { n: 1, title: t("how1Title"), body: t("how1Body") },
              { n: 2, title: t("how2Title"), body: t("how2Body") },
              { n: 3, title: t("how3Title"), body: t("how3Body") },
            ].map((s) => (
              <div key={s.n} className="rounded-card border border-line bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-card bg-aqua-100 font-display text-lg font-bold text-teal-600">
                  {s.n}
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-ink-700">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

type Listing = Awaited<ReturnType<typeof searchListings>>[number];

function toVilla(l: Listing) {
  return {
    name: l.title,
    region: l.regionNameTh,
    sleeps: l.maxGuests,
    bedrooms: l.bedrooms,
    amenities: l.amenities,
    pricePerNightSatang: l.baseWeekdaySatang,
    weekendPriceSatang:
      l.baseWeekendSatang !== l.baseWeekdaySatang ? l.baseWeekendSatang : undefined,
    verified: !!l.legalBadgeAt,
    rating: l.rating ?? undefined,
    reviewCount: l.reviewCount,
  };
}

function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l7 3v6c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V5l7-3z"
        fill="currentColor"
      />
      <path
        d="M9 11.5l2 2 4-4.2"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
