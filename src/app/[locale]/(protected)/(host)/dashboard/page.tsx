import { getTranslations } from "next-intl/server";

import { StatCard } from "@/components/ui/StatCard";
import { StatusPill, type ListingStatus } from "@/components/ui/StatusPill";
import { requireHostEligible } from "@/lib/auth/guards";
import { getHostListings, getHostOverview } from "@/lib/listing/queries";
import { formatSatang } from "@/lib/money";
import { photoUrl } from "@/lib/listing/upload";
import { Link } from "@/i18n/navigation";

/**
 * Host overview (PRODUCT_FLOWS §4.2 ภาพรวม + ที่พักของฉัน). Booking-derived KPIs are
 * Phase 3 and render as zero-states ("—") until M3 — never a fabricated number.
 */
export default async function HostDashboardPage() {
  const user = await requireHostEligible();
  const [t, overview, listings] = await Promise.all([
    getTranslations("Host"),
    getHostOverview(user.id),
    getHostListings(user.id),
  ]);
  const { kpis } = overview;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-3xl text-ink-900">{t("overviewTitle")}</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={t("kpiRevenue")}
            value={kpis.revenueSatang != null ? formatSatang(kpis.revenueSatang) : null}
            hint={kpis.revenueSatang == null ? t("kpiSoon") : undefined}
          />
          <StatCard
            label={t("kpiBookings")}
            value={kpis.bookingsThisMonth != null ? String(kpis.bookingsThisMonth) : null}
            hint={kpis.bookingsThisMonth == null ? t("kpiSoon") : undefined}
          />
          <StatCard
            label={t("kpiResponseRate")}
            value={kpis.responseRatePct != null ? `${kpis.responseRatePct}%` : null}
            hint={kpis.responseRatePct == null ? t("kpiSoon") : undefined}
          />
          <StatCard
            label={t("kpiRating")}
            value={kpis.avgRating != null ? kpis.avgRating.toFixed(1) : null}
            hint={kpis.avgRating == null ? t("kpiSoon") : undefined}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl text-ink-900">{t("listingsTitle")}</h2>

        {listings.length === 0 ? (
          <div className="rounded-card border border-line bg-white p-6 text-center">
            <p className="text-ink-700">{t("listingsEmpty")}</p>
            <Link
              href="/listings/new"
              className="mt-3 inline-block rounded-full bg-aqua-500 px-5 py-2.5 text-sm font-semibold text-white"
            >
              {t("createListing")}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {listings.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-4 rounded-card border border-line bg-white p-4 shadow-card"
              >
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-photo bg-sand-100">
                  {l.coverKey && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl(l.coverKey)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate font-semibold text-ink-900">{l.title}</p>
                  <p className="text-sm text-ink-700">{l.regionNameTh}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={l.status as ListingStatus} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 text-sm font-semibold">
                  <Link href={`/listings/${l.id}/edit`} className="text-teal-600 hover:underline">
                    {t("edit")}
                  </Link>
                  <Link href={`/calendar?listing=${l.id}`} className="text-teal-600 hover:underline">
                    {t("manageCalendar")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
