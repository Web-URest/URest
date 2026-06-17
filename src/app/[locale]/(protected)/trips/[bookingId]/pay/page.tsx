import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatSatang } from "@/lib/money";
import { redirect } from "@/i18n/navigation";

import { PaymentPoller } from "./payment-poller";
import { PaymentTabs } from "./payment-tabs";

/**
 * Guest payment screen (PRODUCT_FLOWS §3.2 step 3). PromptPay default + card tab;
 * the poller advances the guest to the trip page once the webhook confirms payment.
 */
export default async function PayPage({ params }: { params: Promise<{ locale: string; bookingId: string }> }) {
  const [{ locale, bookingId }, user, t] = await Promise.all([
    params,
    requireUser(),
    getTranslations("Booking"),
  ]);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, status: true, totalSatang: true, payBy: true, listing: { select: { title: true } } },
  });
  if (!booking || booking.userId !== user.id || booking.status !== "AWAITING_PAYMENT" || !booking.payBy) {
    redirect({ href: `/trips/${bookingId}`, locale });
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-5 bg-sand-50 px-4 py-8 md:px-6">
      <PaymentPoller bookingId={bookingId} payByIso={booking.payBy.toISOString()} />
      <div className="rounded-card bg-coral-500 px-4 py-3 text-white shadow-card">
        <p className="font-display text-lg">
          {t("payTitle")} · {formatSatang(booking.totalSatang)}
        </p>
        <p className="text-sm text-white/90">{t("payCountdown")}</p>
      </div>
      <PaymentTabs bookingId={bookingId} publicKey={env.OPN_PUBLIC_KEY} />
      <div className="rounded-card border border-line bg-white p-4 text-sm text-ink-900/70 shadow-card">
        <p>{t("payEscrowNote")}</p>
        <p className="mt-2 text-ink-900/90">{t("payRefundPromise")}</p>
      </div>
    </main>
  );
}
