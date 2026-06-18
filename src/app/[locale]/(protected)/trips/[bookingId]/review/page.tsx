import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { canReview } from "@/lib/reviews/reviews";
import { Link } from "@/i18n/navigation";

import { ReviewForm } from "./review-form";

/**
 * Guest review page (PRODUCT_FLOWS §3.4). Guards ownership + the COMPLETED/14-day
 * window via `canReview`; renders the form when eligible, otherwise an explanatory
 * note (already reviewed / window closed) with a link back to the listing.
 */
export default async function ReviewPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const [user, t] = await Promise.all([requireUser(), getTranslations("Reviews")]);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, listingId: true, listing: { select: { title: true } } },
  });
  if (!booking || booking.userId !== user.id) notFound();

  const eligible = await canReview(bookingId, user.id, new Date());

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-5 bg-sand-50 px-4 py-8 md:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-ink-900">{t("title")}</h1>
        <p className="text-sm text-ink-900/70">{booking.listing.title}</p>
      </div>

      {eligible.ok ? (
        <ReviewForm bookingId={bookingId} listingId={booking.listingId} />
      ) : (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
          <p className="text-sm text-ink-900/70">
            {eligible.reason === "ALREADY_REVIEWED" ? t("alreadyReviewed") : t("ineligible")}
          </p>
          <Link
            href={`/listings/${booking.listingId}`}
            className="text-sm font-semibold text-teal-600 underline"
          >
            {t("viewListing")}
          </Link>
        </div>
      )}
    </main>
  );
}
