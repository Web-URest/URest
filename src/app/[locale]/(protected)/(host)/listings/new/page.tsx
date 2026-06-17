import { getTranslations } from "next-intl/server";

import { AuthError, requireHostEligible } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { photoUrl } from "@/lib/listing/upload";
import { redirect } from "@/i18n/navigation";

import { ListingWizard, type WizardInitial } from "./wizard";

/**
 * Host listing wizard entry (PRODUCT_FLOWS §4.1). Server component: enforces the
 * verification ladder (phone-verified host), loads the resume DRAFT (`?id=`) or
 * starts fresh, and hands serialized data to the client wizard. Money is read in
 * satang and handed to the UI as baht; the wizard converts back at the edge.
 */

const toBaht = (satang: number) => satang / 100;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

export default async function NewListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { locale } = await params;
  const { id } = await searchParams;

  let user;
  try {
    user = await requireHostEligible();
  } catch (e) {
    if (e instanceof AuthError && e.reason === "PHONE_UNVERIFIED") {
      redirect({ href: "/verify-phone", locale });
    }
    throw e;
  }

  const [regions, t] = await Promise.all([
    prisma.region.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    getTranslations("Wizard"),
  ]);

  const regionOptions = regions.map((r) => ({
    value: r.id,
    label: locale === "en" ? r.nameEn : r.nameTh,
  }));

  // Resume an existing owned DRAFT, if requested.
  let initial: WizardInitial = {
    listingId: null,
    regions: regionOptions,
    photos: [],
    data: null,
    kycSubmissionId: null,
    kycDocuments: [],
    payout: { bankCode: "", accountName: "", hasSaved: false },
  };

  if (id) {
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { photos: { orderBy: { sortOrder: "asc" } }, seasons: true },
    });
    if (listing && listing.hostId === user.id && listing.status === "DRAFT") {
      // Resume KYC: reuse the in-flight submission + its docs; prefill the
      // payout bank/name (NEVER the encrypted number — ADR-010).
      const [kyc, payoutAccount] = await Promise.all([
        prisma.kycSubmission.findFirst({
          where: { userId: user.id, listingId: listing.id, status: "PENDING_REVIEW" },
          include: { documents: true },
        }),
        prisma.payoutAccount.findFirst({ where: { userId: user.id } }),
      ]);
      initial = {
        listingId: listing.id,
        regions: regionOptions,
        photos: listing.photos.map((p) => ({
          id: p.id,
          r2Key: p.r2Key,
          url: photoUrl(p.r2Key),
          isCover: p.isCover,
          sortOrder: p.sortOrder,
        })),
        kycSubmissionId: kyc?.id ?? null,
        kycDocuments: (kyc?.documents ?? []).map((d) => ({ id: d.id, type: d.type })),
        payout: payoutAccount
          ? { bankCode: payoutAccount.bankCode, accountName: payoutAccount.accountName, hasSaved: true }
          : { bankCode: "", accountName: "", hasSaved: false },
        data: {
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
        },
      };
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-ink-900">{t("title")}</h1>
        <p className="text-ink-700">{t("intro")}</p>
      </header>
      <ListingWizard initial={initial} />
    </main>
  );
}
