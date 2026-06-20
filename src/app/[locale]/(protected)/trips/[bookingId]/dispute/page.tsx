import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";

import { AppealButton } from "./appeal-button";
import { DisputeForm } from "./dispute-form";

/**
 * Guest dispute page (PRODUCT_FLOWS §5.3). While CHECKED_IN the guest can open a
 * dispute (the form freezes the payout + records evidence). Once a dispute exists
 * it shows its state, and — for a resolved dispute the guest hasn't yet appealed —
 * a one-time appeal action.
 */
const RESOLVED = new Set(["RESOLVED_RELEASED", "RESOLVED_PARTIAL", "RESOLVED_REFUNDED"]);

export default async function DisputePage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const [user, t] = await Promise.all([requireUser(), getTranslations("Disputes")]);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      userId: true,
      status: true,
      listing: { select: { title: true } },
      dispute: { select: { status: true, guestAppealedAt: true } },
    },
  });
  if (!booking || booking.userId !== user.id) notFound();

  const dispute = booking.dispute;
  const canOpen = booking.status === "CHECKED_IN" && !dispute;
  const canAppeal = !!dispute && RESOLVED.has(dispute.status) && dispute.guestAppealedAt === null;

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-5 bg-sand-50 px-4 py-8 md:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl text-ink-900">{t("title")}</h1>
        <p className="text-sm text-ink-900/70">{booking.listing.title}</p>
      </div>

      {canOpen ? (
        <DisputeForm bookingId={bookingId} />
      ) : dispute ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
          <p className="text-sm text-ink-900/80">
            {dispute.status === "OPEN" ? t("statusOpen") : t("statusResolved")}
          </p>
          {canAppeal ? <AppealButton bookingId={bookingId} /> : null}
          <Link href={`/trips/${bookingId}`} className="text-sm font-semibold text-teal-600 underline">
            {t("backToTrip")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-5">
          <p className="text-sm text-ink-900/70">{t("ineligible")}</p>
          <Link href={`/trips/${bookingId}`} className="text-sm font-semibold text-teal-600 underline">
            {t("backToTrip")}
          </Link>
        </div>
      )}
    </main>
  );
}
