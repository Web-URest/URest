import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { searchListings, getRegions } from "@/lib/listing/queries";
import { VillaCard } from "@/components/ui/VillaCard";
import { EscrowStrip } from "@/components/ui/EscrowStrip";
import { PillSearchBar } from "@/components/ui/PillSearchBar";
import { CategoryRail } from "@/components/ui/CategoryRail";
import { AskAiButton } from "@/components/ui/AskAiButton";

/**
 * Landing page (Identity v3 "AirBnB skin"). Full-bleed hero with the integrated
 * PillSearchBar → category rail → photo-forward featured grid → escrow-trust story →
 * ask-AI band → how it works. Featured villas = top-rated published Pattaya listings.
 */
export default async function HomePage() {
  const t = await getTranslations("Home");
  const [featuredRaw, regions] = await Promise.all([
    searchListings({
      regionSlug: "pattaya",
      guests: 1,
      amenities: [],
      instantOnly: false,
      sort: "rating",
    }),
    getRegions(),
  ]);
  const featured = featuredRaw.slice(0, 6);
  const regionOpts = regions.map((r) => ({ slug: r.slug, label: r.nameTh }));
  const pillLabels = {
    where: t("searchWhere"),
    when: t("searchWhen"),
    who: t("searchWho"),
    anywhere: t("searchAnywhere"),
    anyDates: t("searchAnyDates"),
    guestsUnit: t("searchGuestsUnit"),
    search: t("searchCta"),
  };

  return (
    <main>
      {/* Hero */}
      <section className="border-b border-border-subtle bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-[1180px] px-6 py-16 text-center md:py-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-trust-50 px-3 py-1.5 text-sm font-semibold text-trust-700">
            <ShieldIcon className="h-4 w-4" /> {t("eyebrow")}
          </span>
          <h1 className="mx-auto mt-5 max-w-[16em] font-display text-4xl font-bold leading-tight tracking-tight text-ink-900 md:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-4 max-w-[34em] text-lg text-ink-700">{t("subtitle")}</p>
          <div className="mt-8 flex justify-center">
            <PillSearchBar
              variant="hero"
              labels={pillLabels}
              regions={regionOpts}
              defaultRegion="pattaya"
            />
          </div>
          <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-trust-700">
            <ShieldIcon className="h-[18px] w-[18px]" /> {t("trustLine")}
          </p>
        </div>
      </section>

      {/* Region category rail */}
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-[1180px] px-6 py-5">
          <CategoryRail
            items={regionOpts.map((r) => ({ key: r.slug, label: r.label }))}
            hrefFor={(slug) => `/search?region=${slug}`}
          />
        </div>
      </section>

      {/* Featured villas */}
      {featured.length > 0 ? (
        <section className="border-b border-border-subtle">
          <div className="mx-auto max-w-[1180px] px-6 py-14">
            <h2 className="font-display text-2xl font-bold text-ink-900 md:text-3xl">
              {t("featuredHeading")}
            </h2>
            <p className="mt-1 text-sm text-ink-500">{t("featuredEyebrow")}</p>
            <div className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((l) => (
                <Link key={l.id} href={`/listings/${l.id}`} className="block">
                  <VillaCard villa={toVilla(l)} chrome="bare" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Escrow-trust story */}
      <section className="border-b border-border-subtle bg-surface-50">
        <div className="mx-auto max-w-[1180px] px-6 py-16">
          <span className="text-sm font-semibold text-trust-700">{t("trustEyebrow")}</span>
          <h2 className="mt-2 max-w-[18em] font-display text-2xl font-bold text-ink-900 md:text-3xl">
            {t("trustHeading")}
          </h2>
          <p className="mt-3 max-w-[40em] text-ink-700">{t("trustBody")}</p>
          <div className="mt-9 max-w-[760px]">
            <EscrowStrip step={2} audience="guest" variant="full" />
          </div>
        </div>
      </section>

      {/* Ask the AI */}
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-[1180px] px-6 py-12">
          <AskAiButton variant="card" label={t("askAiTitle")} sublabel={t("askAiBody")} />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-surface-50">
        <div className="mx-auto max-w-[1180px] px-6 py-16">
          <div className="text-center">
            <span className="text-sm font-semibold text-trust-700">{t("howEyebrow")}</span>
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
              <div
                key={s.n}
                className="rounded-card border border-border-subtle bg-white p-6"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 font-display text-lg font-bold text-brand-700">
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
