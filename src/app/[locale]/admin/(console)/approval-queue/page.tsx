import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { Link, redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { REQUIRED_DOC_TYPES } from "@/lib/kyc/submission";

/**
 * Listing approval queue (PRODUCT_FLOWS §5.1). PENDING_REVIEW submissions, oldest
 * first (SLA ordering); rows older than 24h are flagged coral. Mirrors the
 * unanswered-questions admin page (ink chrome, server-rendered, no modal).
 */

const SLA_MS = 24 * 60 * 60 * 1000;
const bkk = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);

export default async function ApprovalQueuePage() {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const t = await getTranslations("Admin.ListingApprovalQueue");

  const submissions = await prisma.kycSubmission.findMany({
    where: { status: "PENDING_REVIEW", listingId: { not: null } },
    orderBy: { submittedAt: "asc" },
    include: {
      listing: { select: { id: true, title: true } },
      user: { select: { displayName: true } },
      documents: { select: { type: true } },
    },
  });

  const now = Date.now();
  const requiredCount = REQUIRED_DOC_TYPES.length;

  return (
    <section>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sand-300">{t("subtitle")}</p>

      {submissions.length === 0 ? (
        <p className="mt-8 text-sand-400">{t("emptyQueue")}</p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-sand-400">
              <th className="py-2 pr-4">{t("colListing")}</th>
              <th className="py-2 pr-4">{t("colHost")}</th>
              <th className="py-2 pr-4">{t("colDocs")}</th>
              <th className="py-2 pr-4">{t("colSubmitted")}</th>
              <th className="py-2 pr-4">{t("colSla")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => {
              const present = new Set(s.documents.map((d) => d.type));
              const have = REQUIRED_DOC_TYPES.filter((type) => present.has(type)).length;
              const overdue = now - s.submittedAt.getTime() > SLA_MS;
              return (
                <tr key={s.id} className="border-b border-ink-800 hover:bg-ink-800/40">
                  <td className="py-3 pr-4 text-sand-100">{s.listing?.title}</td>
                  <td className="py-3 pr-4 text-sand-300">{s.user.displayName}</td>
                  <td className="py-3 pr-4 tabular-nums text-sand-300">
                    {have}/{requiredCount}
                  </td>
                  <td className="py-3 pr-4 text-sand-400">{bkk(s.submittedAt)}</td>
                  <td className="py-3 pr-4">
                    {overdue ? (
                      <span className="rounded-full bg-coral-500/20 px-2 py-0.5 text-xs font-medium text-coral-500">
                        {t("slaOverdue")}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/admin/approval-queue/${s.id}`}
                      className="rounded bg-aqua-600 px-3 py-1 text-xs font-medium text-white hover:bg-aqua-500"
                    >
                      {t("reviewCta")}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
