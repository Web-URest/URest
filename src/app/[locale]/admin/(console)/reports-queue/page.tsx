import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { Link, redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db";

/**
 * Reports triage queue (PRODUCT_FLOWS §5.6). Open reports (RECEIVED/IN_REVIEW),
 * money-at-risk first (booking reports whose payout is still holdable), then
 * oldest-first. Mirrors the approval-queue admin page (ink chrome, no modal).
 */

const HOLDABLE = new Set(["HELD", "RELEASABLE"]);
const bkk = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);

export default async function ReportsQueuePage() {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const t = await getTranslations("Admin.ReportsQueue");
  const cat = await getTranslations("Reports.categories");

  const reports = await prisma.report.findMany({
    where: { status: { in: ["RECEIVED", "IN_REVIEW"] } },
    include: {
      reporter: { select: { displayName: true } },
      booking: { select: { escrowState: true, listing: { select: { title: true } } } },
      listing: { select: { title: true } },
    },
  });

  const atRisk = (r: (typeof reports)[number]) =>
    !!r.booking && HOLDABLE.has(r.booking.escrowState);

  // Money-at-risk first, then oldest-first.
  const rows = reports.sort((a, b) => {
    const ra = atRisk(a) ? 0 : 1;
    const rb = atRisk(b) ? 0 : 1;
    return ra !== rb ? ra - rb : a.createdAt.getTime() - b.createdAt.getTime();
  });

  const targetLabel = (r: (typeof reports)[number]) =>
    r.bookingId
      ? `${t("targetBooking")}: ${r.booking?.listing.title ?? ""}`
      : r.listingId
        ? `${t("targetListing")}: ${r.listing?.title ?? ""}`
        : r.reviewId
          ? t("targetReview")
          : t("targetUser");

  return (
    <section>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sand-300">{t("subtitle")}</p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sand-400">{t("empty")}</p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-sand-400">
              <th className="py-2 pr-4">{t("colCategory")}</th>
              <th className="py-2 pr-4">{t("colReporter")}</th>
              <th className="py-2 pr-4">{t("colTarget")}</th>
              <th className="py-2 pr-4">{t("colAge")}</th>
              <th className="py-2 pr-4">{t("colRisk")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink-800 hover:bg-ink-800/40">
                <td className="py-3 pr-4 text-sand-100">{cat(r.category)}</td>
                <td className="py-3 pr-4 text-sand-300">{r.reporter?.displayName ?? t("anonymous")}</td>
                <td className="py-3 pr-4 text-sand-300">{targetLabel(r)}</td>
                <td className="py-3 pr-4 text-sand-400">{bkk(r.createdAt)}</td>
                <td className="py-3 pr-4">
                  {atRisk(r) ? (
                    <span className="rounded-full bg-coral-500/20 px-2 py-0.5 text-xs font-medium text-coral-500">
                      {t("moneyAtRisk")}
                    </span>
                  ) : null}
                </td>
                <td className="py-3">
                  <Link
                    href={`/admin/reports-queue/${r.id}`}
                    className="rounded bg-aqua-600 px-3 py-1 text-xs font-medium text-white hover:bg-aqua-500"
                  >
                    {t("reviewCta")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
