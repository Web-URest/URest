import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/guards";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";

import { TripCard } from "./trip-card";

/** Tabs partition the guest's bookings by lifecycle stage (PRODUCT_FLOWS §3.3). */
const TABS = {
  upcoming: ["CONFIRMED", "CHECKED_IN"],
  pending: ["REQUESTED", "AWAITING_PAYMENT"],
  past: ["COMPLETED", "DECLINED", "EXPIRED", "CANCELLED_BY_GUEST", "CANCELLED_BY_HOST", "DISPUTED"],
} as const;
const TAB_KEYS = ["upcoming", "pending", "past"] as const;
type Tab = (typeof TAB_KEYS)[number];

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, user, t] = await Promise.all([searchParams, requireUser(), getTranslations("Booking")]);
  const active: Tab = tab === "pending" || tab === "past" ? tab : "upcoming";

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id, status: { in: [...TABS[active]] } },
    include: {
      listing: { select: { title: true } },
      refund: { select: { refundSatang: true } },
      review: { select: { id: true } },
    },
    orderBy: { checkIn: active === "past" ? "desc" : "asc" },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-5 bg-sand-50 px-4 py-8 md:px-6">
      <h1 className="font-display text-2xl text-ink-900">{t("tripsTitle")}</h1>
      <nav className="flex gap-2" aria-label={t("tripsTitle")}>
        {TAB_KEYS.map((k) => (
          <Link
            key={k}
            href={`/trips?tab=${k}`}
            aria-current={active === k ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              active === k ? "bg-ink-900 text-sand-50" : "text-ink-900/60 hover:bg-sand-100"
            }`}
          >
            {t(`tab_${k}`)}
          </Link>
        ))}
      </nav>
      {bookings.length === 0 ? (
        <p className="text-sm text-ink-900/60">{t("tripsEmpty")}</p>
      ) : (
        bookings.map((b) => <TripCard key={b.id} booking={b} />)
      )}
    </main>
  );
}
