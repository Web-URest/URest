import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth/auth";
import { getSavedVillas } from "@/lib/savedVilla";
import { SavedGrid, type SavedItem } from "./SavedGrid";

export default async function SavedPage() {
  const t = await getTranslations("SavedVillas");
  const session = await auth();

  const rows = session?.user?.id ? await getSavedVillas(session.user.id) : [];

  const items: SavedItem[] = rows.map((row) => ({
    id: row.listingId,
    name: row.listing.title,
    region: row.listing.region.nameTh,
    sleeps: row.listing.maxGuests,
    bedrooms: row.listing.bedrooms,
    amenities: row.listing.amenities as string[],
    pricePerNightSatang: row.listing.baseWeekdaySatang,
    weekendPriceSatang:
      row.listing.baseWeekendSatang !== row.listing.baseWeekdaySatang
        ? row.listing.baseWeekendSatang
        : undefined,
    verified: !!row.listing.legalBadgeAt,
    saved: true,
  }));

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-12 md:px-6">
      <h1 className="mb-8 font-display text-3xl text-ink-900">{t("pageTitle")}</h1>
      <SavedGrid initialItems={items} />
    </main>
  );
}
