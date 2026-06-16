import { prisma } from "@/lib/db";
import { Prisma, type Amenity } from "@prisma/client";

export interface SearchParams {
  regionSlug?: string;
  checkIn?: string;   // YYYY-MM-DD
  checkOut?: string;  // YYYY-MM-DD
  guests?: number;
  amenities?: string[];
  instantOnly?: boolean;
  sort?: "price_asc" | "price_desc" | "rating";
}

export type SearchListing = {
  id: string;
  title: string;
  regionNameTh: string;
  regionSlug: string;
  bedrooms: number;
  maxGuests: number;
  amenities: string[];
  baseWeekdaySatang: number;
  baseWeekendSatang: number;
  bookingMode: string;
  legalBadgeAt: Date | null;
  mapLat: number | null;
  mapLng: number | null;
  coverKey: string | null;
  rating: number | null;
  reviewCount: number;
};

const searchInclude = {
  region: { select: { nameTh: true, slug: true } },
  photos: { where: { isCover: true }, take: 1 },
} satisfies Prisma.ListingInclude;

type SearchRow = Prisma.ListingGetPayload<{ include: typeof searchInclude }>;

export async function searchListings(params: SearchParams): Promise<SearchListing[]> {
  const { regionSlug, guests, amenities, instantOnly, sort, checkIn, checkOut } = params;

  const where: Prisma.ListingWhereInput = {
    status: "PUBLISHED",
    ...(regionSlug ? { region: { slug: regionSlug } } : {}),
    ...(guests ? { maxGuests: { gte: guests } } : {}),
    ...(instantOnly ? { bookingMode: "INSTANT" } : {}),
    ...(amenities && amenities.length > 0 ? { amenities: { hasEvery: amenities as Amenity[] } } : {}),
    // TODO(#19): add booking-overlap exclusion when Booking model lands in Phase 3
    ...(checkIn && checkOut
      ? {
          calendarBlocks: {
            none: {
              startDate: { lte: new Date(checkOut) },
              endDate: { gte: new Date(checkIn) },
            },
          },
        }
      : {}),
  };

  const listings = await prisma.listing.findMany({
    where,
    include: searchInclude,
    orderBy:
      sort === "price_asc"
        ? { baseWeekdaySatang: "asc" }
        : sort === "price_desc"
          ? { baseWeekdaySatang: "desc" }
          : { publishedAt: "desc" },
  });

  return listings.map((l: SearchRow) => ({
    id: l.id,
    title: l.title,
    regionNameTh: l.region.nameTh,
    regionSlug: l.region.slug,
    bedrooms: l.bedrooms,
    maxGuests: l.maxGuests,
    amenities: l.amenities as string[],
    baseWeekdaySatang: l.baseWeekdaySatang,
    baseWeekendSatang: l.baseWeekendSatang,
    bookingMode: l.bookingMode,
    legalBadgeAt: l.legalBadgeAt,
    mapLat: l.mapLat,
    mapLng: l.mapLng,
    coverKey: l.photos[0]?.r2Key ?? null,
    rating: null,
    reviewCount: 0,
  }));
}

export type ListingDetail = Awaited<ReturnType<typeof getListingDetail>>;

const detailInclude = {
  region: true,
  host: { select: { id: true, displayName: true, image: true, createdAt: true } },
  photos: { orderBy: { sortOrder: "asc" as const } },
  seasons: { orderBy: { startDate: "asc" as const } },
  faqEntries: {
    where: { status: "PUBLISHED" as const },
    orderBy: { sortOrder: "asc" as const },
  },
  calendarBlocks: {
    where: { endDate: { gte: new Date() } },
    orderBy: { startDate: "asc" as const },
  },
} satisfies Prisma.ListingInclude;

type DetailRow = Prisma.ListingGetPayload<{ include: typeof detailInclude }>;

export async function getListingDetail(id: string) {
  const listing = await prisma.listing.findUnique({
    where: { id, status: "PUBLISHED" },
    include: detailInclude,
  }) as DetailRow | null;

  if (!listing) return null;

  const holidays = await prisma.thaiHoliday.findMany({ select: { date: true } });
  const holidaySet = new Set(
    holidays.map((h) => h.date.toISOString().slice(0, 10)),
  );

  const attractionRows = await prisma.attraction.findMany({
    where: { regionId: listing.regionId, isActive: true },
  });

  const withDistance = attractionRows
    .map((a) => ({
      ...a,
      distKm:
        listing.mapLat && listing.mapLng
          ? haversineKm(listing.mapLat, listing.mapLng, a.lat, a.lng)
          : null,
    }))
    .sort((a, b) => (a.distKm ?? 999) - (b.distKm ?? 999))
    .slice(0, 6);

  return { listing, holidaySet, attractions: withDistance };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
