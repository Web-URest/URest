import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { StatusPill } from "@/components/ui/StatusPill";
import { ReportForm } from "@/components/ui/ReportForm";
import { submitBookingReportAction } from "@/app/[locale]/(protected)/reports/actions";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { maskedContact } from "@/lib/booking/contact";
import { computeRefund } from "@/lib/booking/refund";
import { daysUntil } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { formatSatang } from "@/lib/money";

import { CancelButton } from "./cancel-button";
import { WithdrawButton } from "./withdraw-button";

/**
 * Guest booking-status (PRODUCT_FLOWS §3.2 step 2). Minimal — #23 owns the full
 * trips tabs. Shows the status, masked host contact (until CONFIRMED), and a
 * withdraw action while the request is pre-payment.
 */
export default async function TripPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const [{ bookingId }, user, t, tr, tMsg, tDispute] = await Promise.all([
    params,
    requireUser(),
    getTranslations("Booking"),
    getTranslations("Reports"),
    getTranslations("Thread"),
    getTranslations("Disputes"),
  ]);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      listing: { select: { title: true, host: { select: { email: true, phone: true } } } },
      dispute: { select: { status: true } },
    },
  });
  if (!booking || booking.userId !== user.id) notFound();

  const contact = maskedContact(booking.contactUnmaskedAt, {
    email: booking.listing.host.email,
    phone: booking.listing.host.phone,
  });
  const canWithdraw = booking.status === "REQUESTED" || booking.status === "AWAITING_PAYMENT";
  const reportable = !["DECLINED", "EXPIRED", "CANCELLED_BY_GUEST", "CANCELLED_BY_HOST"].includes(
    booking.status,
  );
  const canMessage = ["REQUESTED", "AWAITING_PAYMENT", "CONFIRMED", "CHECKED_IN", "DISPUTED"].includes(booking.status);
  const canOpenDispute = booking.status === "CHECKED_IN" && !booking.dispute;

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-6 bg-sand-50 px-4 py-8 md:px-6">
      <h1 className="font-display text-2xl text-ink-900">{t("statusTitle")}</h1>
      <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg text-ink-900">{booking.listing.title}</h2>
          <StatusPill status={booking.status} />
        </div>
        {booking.status === "REQUESTED" && (
          <p className="text-sm text-ink-900/60">{t("respondByNote")}</p>
        )}
        <p className="text-sm text-ink-900/70">
          {contact.phone || contact.email
            ? [contact.phone, contact.email].filter(Boolean).join(" · ")
            : t("contactMasked")}
        </p>
        {booking.status === "AWAITING_PAYMENT" && (
          <Link
            href={`/trips/${booking.id}/pay`}
            className="rounded-card bg-coral-500 px-4 py-2 text-center text-sm font-semibold text-white shadow-card transition hover:brightness-95"
          >
            {t("payCta")}
          </Link>
        )}
        {canMessage && (
          <Link
            href={`/messages/${booking.id}`}
            className="rounded-card border border-line px-4 py-2 text-center text-sm font-semibold text-ink-900 transition hover:bg-sand-50"
          >
            {tMsg("messageHost")}
          </Link>
        )}
        {(canOpenDispute || booking.dispute) && (
          <Link
            href={`/trips/${booking.id}/dispute`}
            className="rounded-card border border-line px-4 py-2 text-center text-sm font-semibold text-ink-900 transition hover:bg-sand-50"
          >
            {booking.dispute ? tDispute("viewCase") : tDispute("title")}
          </Link>
        )}
        {canWithdraw && <WithdrawButton bookingId={booking.id} />}
        {booking.status === "CONFIRMED" && (
          <CancelButton
            bookingId={booking.id}
            refundLabel={formatSatang(
              computeRefund({
                totalSatang: booking.totalSatang,
                tier: booking.cancellationTier,
                daysBeforeCheckIn: daysUntil(booking.checkIn, new Date()),
              }).refundSatang,
            )}
          />
        )}
      </div>
      {reportable && (
        <details className="text-sm text-ink-900/50">
          <summary className="cursor-pointer underline hover:text-ink-700">
            {tr("reportBooking")}
          </summary>
          <ReportForm action={submitBookingReportAction.bind(null, booking.id)} />
        </details>
      )}
    </main>
  );
}
