import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { requireHostEligible } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatSatang } from "@/lib/money";

import { HostCancelButton } from "./cancel-button";

/**
 * Host bookings (PRODUCT_FLOWS §3.3 host side). Lists the host's confirmed/checked-in
 * stays, soonest check-in first, with a (destructive) cancel action — host cancellation
 * is a 100% guest refund + a strike (ADR-012 §2).
 */
export default async function HostBookingsPage() {
  const [host, t, tMsg] = await Promise.all([
    requireHostEligible(),
    getTranslations("Host.bookings"),
    getTranslations("Thread"),
  ]);

  const bookings = await prisma.booking.findMany({
    where: { status: { in: ["CONFIRMED", "CHECKED_IN"] }, listing: { hostId: host.id } },
    include: { listing: { select: { title: true } }, user: { select: { displayName: true } } },
    orderBy: { checkIn: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl text-ink-900">{t("title")}</h1>
      {bookings.length === 0 ? (
        <p className="text-sm text-ink-900/60">{t("empty")}</p>
      ) : (
        bookings.map((b) => (
          <div key={b.id} className="flex flex-col gap-2 rounded-card border border-line bg-white p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg text-ink-900">{b.listing.title}</h2>
              <span className="text-sm font-semibold text-ink-900">{formatSatang(b.totalSatang)}</span>
            </div>
            <p className="text-sm text-ink-900/70">
              {b.user.displayName} · {b.checkIn.toISOString().slice(0, 10)} – {b.checkOut.toISOString().slice(0, 10)}
            </p>
            {b.code && <p className="text-xs text-ink-900/50">{b.code}</p>}
            <Link href={`/messages/${b.id}`} className="text-sm font-semibold text-teal-600 hover:underline">
              {tMsg("messageGuest")}
            </Link>
            <HostCancelButton bookingId={b.id} />
          </div>
        ))
      )}
    </div>
  );
}
