import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { StatusPill } from "@/components/ui/StatusPill";
import { requireUser } from "@/lib/auth/guards";
import { maskedContact } from "@/lib/booking/contact";
import { prisma } from "@/lib/db";

import { WithdrawButton } from "./withdraw-button";

/**
 * Guest booking-status (PRODUCT_FLOWS §3.2 step 2). Minimal — #23 owns the full
 * trips tabs. Shows the status, masked host contact (until CONFIRMED), and a
 * withdraw action while the request is pre-payment.
 */
export default async function TripPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const [{ bookingId }, user, t] = await Promise.all([
    params,
    requireUser(),
    getTranslations("Booking"),
  ]);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { listing: { select: { title: true, host: { select: { email: true, phone: true } } } } },
  });
  if (!booking || booking.userId !== user.id) notFound();

  const contact = maskedContact(booking.contactUnmaskedAt, {
    email: booking.listing.host.email,
    phone: booking.listing.host.phone,
  });
  const canWithdraw = booking.status === "REQUESTED" || booking.status === "AWAITING_PAYMENT";

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
        {canWithdraw && <WithdrawButton bookingId={booking.id} />}
      </div>
    </main>
  );
}
