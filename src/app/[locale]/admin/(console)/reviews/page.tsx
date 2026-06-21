import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { redirect } from "@/i18n/navigation";

import { keepReviewAction, removeReviewAction } from "./actions";

/**
 * Admin review-moderation queue (PRODUCT_FLOWS §5.5, issue #28). Flagged reviews
 * (reviewId-scoped Reports, still open) with the flag reason and the review;
 * keep (dismiss) or remove (soft-delete + audit). Mirrors the payouts/approval
 * console pages. Removal is policy-violation-only — hosts can never pay to remove
 * a review.
 */
const bkk = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }).format(d);

export default async function AdminReviewsPage() {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const t = await getTranslations("Admin.Reviews");

  const flags = await prisma.report.findMany({
    // `review: { isNot: null }` excludes any flag orphaned by the reviewId SetNull
    // (a cascade-deleted review) so the render below always has its review.
    where: { reviewId: { not: null }, review: { isNot: null }, status: { in: ["RECEIVED", "IN_REVIEW"] } },
    orderBy: { createdAt: "asc" },
    include: {
      review: {
        select: {
          id: true,
          overall: true,
          text: true,
          removedAt: true,
          author: { select: { displayName: true } },
          booking: { select: { listing: { select: { title: true } } } },
        },
      },
    },
  });

  return (
    <section>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-ink-700">{t("subtitle")}</p>

      {flags.length === 0 ? (
        <p className="mt-8 text-ink-700">{t("empty")}</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {flags.map((f) => (
            <div key={f.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-ink-900">{f.review?.booking.listing.title}</span>
                <span className="text-xs text-ink-700">{bkk(f.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-700">
                {t("flagReason")}: {f.text}
              </p>

              {f.review && (
                <blockquote className="mt-3 rounded bg-surface-100 p-3 text-sm text-ink-900">
                  <span className="text-gold-400">{"★".repeat(f.review.overall)}</span>{" "}
                  <span className="text-ink-700">— {f.review.author.displayName}</span>
                  {f.review.text && <p className="mt-1">{f.review.text}</p>}
                  {f.review.removedAt && <p className="mt-1 text-coral-500">{t("alreadyRemoved")}</p>}
                </blockquote>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={keepReviewAction}>
                  <input type="hidden" name="reportId" value={f.id} />
                  <button
                    type="submit"
                    className="rounded border border-border px-3 py-1 text-sm text-ink-700 hover:bg-surface-50"
                  >
                    {t("keep")}
                  </button>
                </form>
                <form action={removeReviewAction} className="flex items-center gap-2">
                  <input type="hidden" name="reportId" value={f.id} />
                  <input type="hidden" name="reviewId" value={f.reviewId ?? ""} />
                  <input
                    name="reason"
                    required
                    placeholder={t("removeReasonPlaceholder")}
                    className="rounded border border-border bg-white px-2 py-1 text-sm text-ink-900 placeholder:text-ink-700"
                  />
                  <button
                    type="submit"
                    className="rounded bg-coral-500 px-3 py-1 text-sm font-medium text-white hover:bg-coral-600"
                  >
                    {t("remove")}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
