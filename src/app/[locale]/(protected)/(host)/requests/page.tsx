import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { requireHostEligible } from "@/lib/auth/guards";
import { maskedContact } from "@/lib/booking/contact";
import { prisma } from "@/lib/db";
import { formatSatang } from "@/lib/money";

import { RequestActions } from "./request-actions";

/**
 * Host requests inbox (PRODUCT_FLOWS §3.2 — host side). Lists REQUESTED bookings
 * for the host's listings, oldest deadline first, with the guest note + masked
 * contact and accept/decline. The (host) layout supplies the chrome + nav.
 */
export default async function HostRequestsPage() {
  const [host, t, tMsg] = await Promise.all([
    requireHostEligible(),
    getTranslations("Host.requests"),
    getTranslations("Thread"),
  ]);

  const requests = await prisma.booking.findMany({
    where: { status: "REQUESTED", listing: { hostId: host.id } },
    include: {
      listing: { select: { title: true } },
      user: { select: { displayName: true, email: true, phone: true } },
    },
    orderBy: { respondBy: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl text-ink-900">{t("title")}</h1>
      {requests.length === 0 ? (
        <p className="text-sm text-ink-900/60">{t("empty")}</p>
      ) : (
        requests.map((b) => {
          const contact = maskedContact(b.contactUnmaskedAt, { email: b.user.email, phone: b.user.phone });
          return (
            <div key={b.id} className="flex flex-col gap-2 rounded-card border border-line bg-white p-5 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg text-ink-900">{b.listing.title}</h2>
                <span className="text-sm font-semibold text-ink-900">{formatSatang(b.totalSatang)}</span>
              </div>
              <p className="text-sm text-ink-900/70">
                {b.user.displayName} · {b.checkIn.toISOString().slice(0, 10)} – {b.checkOut.toISOString().slice(0, 10)}
              </p>
              {b.guestNoteToHost && (
                <p className="text-sm text-ink-900/80">
                  <span className="text-ink-900/50">{t("guestNote")}: </span>
                  {b.guestNoteToHost}
                </p>
              )}
              <p className="text-xs text-ink-900/50">
                {contact.phone || contact.email
                  ? [contact.phone, contact.email].filter(Boolean).join(" · ")
                  : t("contactMasked")}
              </p>
              <p className="text-xs text-coral-600">{t("respondByNote")}</p>
              <Link href={`/messages/${b.id}`} className="text-sm font-semibold text-teal-600 hover:underline">
                {tMsg("messageGuest")}
              </Link>
              <RequestActions bookingId={b.id} />
            </div>
          );
        })
      )}
    </div>
  );
}
