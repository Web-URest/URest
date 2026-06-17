import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { StatusPill, type ListingStatus } from "@/components/ui/StatusPill";
import { requireHostEligible } from "@/lib/auth/guards";
import { getHostListingForEdit } from "@/lib/listing/queries";

import type { WizardData } from "../../new/wizard";
import { EditForm } from "./edit-form";
import type { FaqRow } from "./actions";

/**
 * Edit Villa page (PRODUCT_FLOWS §4.4). Loads the host's own listing in any status,
 * serialises money satang → baht for the form (converted back at save), and renders
 * a section-per-card editor. The live status pill reflects re-review re-queues.
 */

const toBaht = (satang: number) => satang / 100;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export default async function EditVillaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostEligible();
  const [t, listing] = await Promise.all([
    getTranslations("Host"),
    getHostListingForEdit(id, user.id),
  ]);

  if (!listing) notFound();

  const initial: WizardData = {
    regionId: listing.regionId,
    title: listing.title,
    description: listing.description,
    address: listing.address,
    mapLat: listing.mapLat,
    mapLng: listing.mapLng,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    baths: listing.baths,
    maxGuests: listing.maxGuests,
    poolLengthM: listing.poolLengthM ? Number(listing.poolLengthM) : null,
    poolWidthM: listing.poolWidthM ? Number(listing.poolWidthM) : null,
    poolDepthM: listing.poolDepthM ? Number(listing.poolDepthM) : null,
    amenities: listing.amenities,
    partyPolicy: listing.partyPolicy,
    quietHoursStart: listing.quietHoursStart,
    quietHoursEnd: listing.quietHoursEnd,
    cashDepositBaht: toBaht(listing.cashDepositSatang),
    checkInTime: listing.checkInTime,
    checkOutTime: listing.checkOutTime,
    baseWeekdayBaht: toBaht(listing.baseWeekdaySatang),
    baseWeekendBaht: toBaht(listing.baseWeekendSatang),
    holidayBaht: listing.holidaySatang != null ? toBaht(listing.holidaySatang) : null,
    includedGuests: listing.includedGuests,
    extraGuestFeeBaht: toBaht(listing.extraGuestFeeSatang),
    cancellationTier: listing.cancellationTier,
    bookingMode: listing.bookingMode,
    instantAck: listing.instantAckAt != null,
    seasons: listing.seasons.map((s) => ({
      nameTh: s.nameTh,
      startDate: dateOnly(s.startDate),
      endDate: dateOnly(s.endDate),
      weekdayBaht: toBaht(s.weekdaySatang),
      weekendBaht: toBaht(s.weekendSatang),
    })),
  };

  const faqInitial: FaqRow[] = listing.faqEntries.map((f) => ({
    id: f.id,
    question: f.question,
    answer: f.answer,
    status: f.status,
    source: f.source,
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-ink-900">{listing.title}</h1>
        <StatusPill status={listing.status as ListingStatus} />
      </header>
      <p className="text-ink-700">{t("editTitle")}</p>
      <EditForm listingId={listing.id} initial={initial} faqInitial={faqInitial} />
    </div>
  );
}
