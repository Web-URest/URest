import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth/auth";
import { searchListings } from "@/lib/listing/queries";
import { getSavedVillaIds } from "@/lib/savedVilla";
import { VillaCard } from "@/components/ui/VillaCard";
import { HeartButton } from "@/components/ui/HeartButton";
import { SearchFilters } from "@/components/ui/SearchFilters";
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

  const [session, listings] = await Promise.all([
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
  ]);

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
    <main className="min-h-screen bg-sand-50">
      {/* Sticky sub-header */}
      <div className="sticky top-0 z-20 border-b border-line bg-white/95 px-4 py-3 backdrop-blur md:px-6">
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
              className="rounded-full border border-line bg-sand-100 px-3 py-1.5 text-xs font-semibold text-ink-900 outline-none"
              placeholder="เช็คอิน"
            />
            <span className="text-ink-900/40">→</span>
            <input
              name="checkOut"
              type="date"
              defaultValue={checkOut}
              className="rounded-full border border-line bg-sand-100 px-3 py-1.5 text-xs font-semibold text-ink-900 outline-none"
              placeholder="เช็คเอาท์"
            />
            <input
              name="guests"
              type="number"
              min={1}
              max={30}
              defaultValue={guests}
              className="w-16 rounded-full border border-line bg-sand-100 px-3 py-1.5 text-xs font-semibold text-ink-900 outline-none"
              placeholder="คน"
            />
            <button
              type="submit"
              className="rounded-full bg-aqua-500 px-4 py-1.5 text-xs font-semibold text-white"
            >
              {t("searchButton")}
            </button>
          </form>
          <Suspense>
            <SearchFilters />
          </Suspense>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-4 md:px-6">
        {/* Result count + AI suggest */}
        <div className="flex items-center justify-between py-4">
          <p className="text-sm font-semibold text-ink-900">
            {t("resultCount", { count: listings.length })}
          </p>
          <button type="button" className="text-sm font-semibold text-teal-600">
            {t("aiSuggest")}
          </button>
        </div>

        {/* Desktop: list left + map right. Mobile: list only + floating pill */}
        <div className="relative flex gap-6">
          {/* Results list */}
          <div className="flex-1">
            {listings.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <p className="font-display text-2xl text-ink-900">{t("noResults")}</p>
                <p className="text-sm text-ink-900/60">{t("noResultsHint")}</p>
                <button
                  type="button"
                  className="mt-2 rounded-full bg-aqua-500 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  {t("emptyAiCta")}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 pb-24 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {listings.map((l) => (
                  <div key={l.id} className="relative">
                    <Link href={`/listings/${l.id}`}>
                      <VillaCard
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
