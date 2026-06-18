import { getTranslations } from "next-intl/server";

import { ReportStatusTrail, type ReportStatus } from "@/components/ui/ReportStatusTrail";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";

/**
 * Reporter status surface (§3.8, AC#2). The signed-in user's submitted reports,
 * each with the รับเรื่อง → กำลังตรวจสอบ → ผลการตัดสิน trail + the decision reason.
 */
export default async function MyReportsPage() {
  const user = await requireUser();
  const [t, cat] = await Promise.all([
    getTranslations("Reports"),
    getTranslations("Reports.categories"),
  ]);

  const reports = await prisma.report.findMany({
    where: { reporterId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      booking: { select: { listing: { select: { title: true } } } },
      listing: { select: { title: true } },
    },
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-display text-3xl text-ink-900">{t("title")}</h1>

      {reports.length === 0 ? (
        <p className="text-ink-700">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-card bg-white p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-900">{cat(r.category)}</span>
                <span className="text-sm text-ink-700">
                  {r.booking?.listing.title ?? r.listing?.title ?? ""}
                </span>
              </div>
              <ReportStatusTrail status={r.status as ReportStatus} />
              {r.resolvedReason ? (
                <p className="text-sm text-ink-700">
                  <span className="text-ink-500">{t("trail.resolved")}: </span>
                  {r.resolvedReason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
