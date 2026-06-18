import { prisma } from "@/lib/db";
import { loadListingReviews } from "@/lib/reviews/reviews";
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
    rating: l.avgRating === null ? null : Math.round(l.avgRating * 10) / 10,
    reviewCount: l.reviewCount,
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

  const reviews = await loadListingReviews(id);

  return { listing, holidaySet, attractions: withDistance, reviews };
}

// ── Host-scoped reads (PRODUCT_FLOWS §4.2 dashboard, §4.4 edit) ───────────────
// Unlike the guest reads above, these are NOT filtered to PUBLISHED — a host sees
// their listings in every status — and every one is gated to the owning host.

export type HostListingSummary = {
  id: string;
  title: string;
  status: string;
  bookingMode: string;
  regionNameTh: string;
  coverKey: string | null;
};

/** The host's listings (all statuses) for the ที่พักของฉัน list + overview. */
export async function getHostListings(hostId: string): Promise<HostListingSummary[]> {
  const listings = await prisma.listing.findMany({
    where: { hostId },
    include: {
      region: { select: { nameTh: true } },
      photos: { where: { isCover: true }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  return listings.map((l) => ({
    id: l.id,
    title: l.title,
    status: l.status,
    bookingMode: l.bookingMode,
    regionNameTh: l.region.nameTh,
    coverKey: l.photos[0]?.r2Key ?? null,
  }));
}

const hostEditInclude = {
  region: { select: { id: true, nameTh: true, slug: true } },
  photos: { orderBy: { sortOrder: "asc" as const } },
  seasons: { orderBy: { startDate: "asc" as const } },
  faqEntries: { orderBy: { sortOrder: "asc" as const } },
  calendarBlocks: { orderBy: { startDate: "asc" as const } },
} satisfies Prisma.ListingInclude;

export type HostListingForEdit = Prisma.ListingGetPayload<{
  include: typeof hostEditInclude;
}>;

/** Full listing for the Edit Villa page, gated to the owner (null otherwise). */
export async function getHostListingForEdit(
  listingId: string,
  hostId: string,
): Promise<HostListingForEdit | null> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: hostEditInclude,
  });
  if (!listing || listing.hostId !== hostId) return null;
  return listing;
}

export type HostOverview = {
  statusCounts: Record<string, number>;
  /**
   * Booking-derived KPIs (PRODUCT_FLOWS §4.2). Booking/Review data is Phase 3 and
   * not seeded yet, so these are zero-states until M3 populates them — the UI
   * renders "—", never a fabricated number.
   */
  kpis: {
    revenueSatang: number | null;
    bookingsThisMonth: number | null;
    responseRatePct: number | null;
    avgRating: number | null;
  };
};

/** Status tallies for the overview alert tiles + zero-state KPIs. */
export async function getHostOverview(hostId: string): Promise<HostOverview> {
  const grouped = await prisma.listing.groupBy({
    by: ["status"],
    where: { hostId },
    _count: { _all: true },
  });

  const statusCounts: Record<string, number> = {};
  for (const g of grouped) statusCounts[g.status] = g._count._all;

  // Host-wide average review score across all their listings (§4.2). The other
  // KPIs (revenue, response rate) remain zero-state until their own slices land.
  const ratingAgg = await prisma.review.aggregate({
    where: { removedAt: null, booking: { listing: { hostId } } },
    _avg: { overall: true },
  });

  return {
    statusCounts,
    kpis: {
      revenueSatang: null,
      bookingsThisMonth: null,
      responseRatePct: null,
      avgRating: ratingAgg._avg.overall,
    },
  };
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
