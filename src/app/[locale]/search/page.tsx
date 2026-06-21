import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth/auth";
import { searchListings, getRegions } from "@/lib/listing/queries";
import { getSavedVillaIds } from "@/lib/savedVilla";
import { VillaCard } from "@/components/ui/VillaCard";
import { HeartButton } from "@/components/ui/HeartButton";
import { SearchFilters } from "@/components/ui/SearchFilters";
import { CategoryRail } from "@/components/ui/CategoryRail";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { MapView, type MapPin } from "@/components/ui/MapView";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function sp(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const t = await getTranslations("Search");

  const regionSlug = sp(params.region) || "pattaya";
  const checkIn = sp(params.checkIn);
  const checkOut = sp(params.checkOut);
  const guests = parseInt(sp(params.guests)) || 1;
  const amenityRaw = sp(params.amenities);
  const amenities = amenityRaw ? amenityRaw.split(",").filter(Boolean) : [];
  const instantOnly = params.instant === "1";
  const sort = (sp(params.sort) || "price_asc") as "price_asc" | "price_desc" | "rating";

  const [session, listings, regions] = await Promise.all([
    auth(),
    searchListings({
      regionSlug,
      checkIn: checkIn || undefined,
      checkOut: checkOut || undefined,
      guests,
      amenities,
      instantOnly,
      sort,
    }),
    getRegions(),
  ]);

  // Preserve dates/guests when switching region via the category rail.
  const railQuery = new URLSearchParams();
  if (checkIn) railQuery.set("checkIn", checkIn);
  if (checkOut) railQuery.set("checkOut", checkOut);
  if (guests > 1) railQuery.set("guests", String(guests));
  const railSuffix = railQuery.toString() ? `&${railQuery}` : "";

  const savedIds = session?.user?.id
    ? await getSavedVillaIds(
        session.user.id,
        listings.map((l) => l.id),
      )
    : new Set<string>();

  const mapPins: MapPin[] = listings
    .filter((l) => l.mapLat !== null && l.mapLng !== null)
    .map((l) => ({
      id: l.id,
      lat: l.mapLat!,
      lng: l.mapLng!,
      priceSatang: l.baseWeekdaySatang,
      title: l.title,
    }));

  // Pattaya center fallback
  const centerLat = 12.9236;
  const centerLng = 100.8825;

  return (
    <main className="min-h-screen">
      {/* Sticky sub-header */}
      <div className="sticky top-0 z-20 border-b border-border-subtle bg-white/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto max-w-[1280px]">
          {/* Editable summary row */}
          <form
            method="GET"
            className="mb-3 flex flex-wrap items-center gap-2 text-sm"
          >
            <input type="hidden" name="region" value={regionSlug} />
            <input
              name="checkIn"
              type="date"
              defaultValue={checkIn}
              className="rounded-pill border border-border bg-surface-50 px-3 py-1.5 text-xs font-semibold text-ink-900 outline-none"
              placeholder="เช็คอิน"
            />
            <span className="text-ink-500">→</span>
            <input
              name="checkOut"
              type="date"
              defaultValue={checkOut}
              className="rounded-pill border border-border bg-surface-50 px-3 py-1.5 text-xs font-semibold text-ink-900 outline-none"
              placeholder="เช็คเอาท์"
            />
            <input
              name="guests"
              type="number"
              min={1}
              max={30}
              defaultValue={guests}
              className="w-16 rounded-pill border border-border bg-surface-50 px-3 py-1.5 text-xs font-semibold text-ink-900 outline-none"
              placeholder="คน"
            />
            <button
              type="submit"
              className="rounded-pill bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600"
            >
              {t("searchButton")}
            </button>
          </form>
          <Suspense>
            <SearchFilters />
          </Suspense>
          <div className="mt-3">
            <CategoryRail
              items={regions.map((r) => ({ key: r.slug, label: r.nameTh }))}
              activeKey={regionSlug}
              hrefFor={(slug) => `/search?region=${slug}${railSuffix}`}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-4 md:px-6">
        {/* Result count + AI suggest */}
        <div className="flex items-center justify-between py-4">
          <p className="text-sm font-semibold text-ink-900">
            {t("resultCount", { count: listings.length })}
          </p>
          <AskAiButton variant="inline" label={t("aiSuggest")} />
        </div>

        {/* Desktop: list left + map right. Mobile: list only + floating pill */}
        <div className="relative flex gap-6">
          {/* Results list */}
          <div className="flex-1">
            {listings.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <p className="font-display text-2xl font-bold text-ink-900">{t("noResults")}</p>
                <p className="text-sm text-ink-500">{t("noResultsHint")}</p>
                <AskAiButton variant="chip" label={t("emptyAiCta")} className="mt-2" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 pb-24 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {listings.map((l) => (
                  <div key={l.id} className="relative">
                    <Link href={`/listings/${l.id}`}>
                      <VillaCard
                        chrome="bare"
                        villa={{
                          name: l.title,
                          region: l.regionNameTh,
                          sleeps: l.maxGuests,
                          bedrooms: l.bedrooms,
                          amenities: l.amenities,
                          pricePerNightSatang: l.baseWeekdaySatang,
                          weekendPriceSatang:
                            l.baseWeekendSatang !== l.baseWeekdaySatang
                              ? l.baseWeekendSatang
                              : undefined,
                          verified: !!l.legalBadgeAt,
                          rating: l.rating ?? undefined,
                          reviewCount: l.reviewCount,
                        }}
                        heartSlot={
                          <HeartButton
                            listingId={l.id}
                            initialSaved={savedIds.has(l.id)}
                          />
                        }
                      />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop sticky map (40% width) */}
          {mapPins.length > 0 && (
            <div className="sticky top-[104px] hidden h-[calc(100vh-120px)] w-[40%] shrink-0 md:block">
              <MapView
                pins={mapPins}
                centerLat={centerLat}
                centerLng={centerLng}
              />
            </div>
          )}
        </div>

        {/* Mobile floating map pill */}
        {mapPins.length > 0 && (
          <MobileMapToggle pins={mapPins} centerLat={centerLat} centerLng={centerLng} />
        )}
      </div>
    </main>
  );
}

// Inline client component for mobile map toggle — keeps the page mostly server-rendered
function MobileMapToggle({
  pins,
  centerLat,
  centerLng,
}: {
  pins: MapPin[];
  centerLat: number;
  centerLng: number;
}) {
  return (
    <MobileMapClient pins={pins} centerLat={centerLat} centerLng={centerLng} />
  );
}

// Separate file would be cleaner, but inline keeps issue scope tight.
import { MobileMapClient } from "./MobileMapClient";
