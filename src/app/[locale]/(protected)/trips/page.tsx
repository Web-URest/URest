import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/guards";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";

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
      listing: {
        select: {
          title: true,
          photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { r2Key: true } },
        },
      },
      refund: { select: { refundSatang: true } },
      review: { select: { id: true } },
    },
    orderBy: { checkIn: active === "past" ? "desc" : "asc" },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-[820px] flex-col gap-5 px-4 py-8 md:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">{t("tripsTitle")}</h1>
      <nav className="flex gap-1 border-b border-border-subtle" aria-label={t("tripsTitle")}>
        {TAB_KEYS.map((k) => (
          <Link
            key={k}
            href={`/trips?tab=${k}`}
            aria-current={active === k ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              active === k
                ? "border-ink-900 text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {t(`tab_${k}`)}
          </Link>
        ))}
      </nav>
      {bookings.length === 0 ? (
        <EmptyState
          title={t("tripsEmpty")}
          primaryAction={
            <Link
              href="/search"
              className="inline-flex items-center justify-center rounded-pill bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              {t("tripsExplore")}
            </Link>
          }
        />
      ) : (
        bookings.map((b) => <TripCard key={b.id} booking={b} />)
      )}
    </main>
  );
}
