import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { Link, redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db";

import {
  acceptAction,
  dismissAction,
  escalateAction,
  resolveAction,
  strikeAction,
  unlistAction,
} from "../actions";

/**
 * Report review detail (§5.6). Shows the report + its target, then the triage
 * actions valid for its kind/state. Mirrors the approval-queue detail page.
 */

const HOLDABLE = new Set(["HELD", "RELEASABLE"]);

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const { reportId } = await params;
  const t = await getTranslations("Admin.ReportsQueue");
  const cat = await getTranslations("Reports.categories");

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      reporter: { select: { displayName: true } },
      booking: { select: { escrowState: true, listing: { select: { title: true } } } },
      listing: { select: { title: true, status: true } },
    },
  });
  if (!report) notFound();

  const isBooking = !!report.bookingId;
  const isListing = !!report.listingId;
  const isOpen = report.status === "RECEIVED" || report.status === "IN_REVIEW";
  const canAccept = report.status === "RECEIVED";
  const atRisk = !!report.booking && HOLDABLE.has(report.booking.escrowState);

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href="/admin/reports-queue" className="text-sm text-sand-400 hover:text-sand-200">
          {t("backToQueue")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{cat(report.category)}</h1>
        <p className="mt-1 text-sand-300">
          {report.reporter?.displayName ?? t("anonymous")} ·{" "}
          {isBooking
            ? `${t("targetBooking")}: ${report.booking?.listing.title ?? ""}`
            : isListing
              ? `${t("targetListing")}: ${report.listing?.title ?? ""}`
              : report.reviewId
                ? t("targetReview")
                : t("targetUser")}
        </p>
        {atRisk ? (
          <span className="mt-2 inline-block rounded-full bg-coral-500/20 px-2 py-0.5 text-xs font-medium text-coral-500">
            {t("moneyAtRisk")}
          </span>
        ) : null}
      </div>

      <div>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-sand-300">
          {t("reportText")}
        </h2>
        <p className="whitespace-pre-wrap text-sand-100">{report.text}</p>
      </div>

      {isOpen ? (
        <div className="flex flex-col gap-6 border-t border-ink-700 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sand-300">
            {t("decisionTitle")}
          </h2>

          {canAccept ? (
            <form action={acceptAction.bind(null, report.id)}>
              <button
                type="submit"
                className="rounded-full bg-aqua-600 px-5 py-2 text-sm font-medium text-white hover:bg-aqua-500"
              >
                {t("accept")}
              </button>
              <span className="ml-3 text-xs text-sand-400">{t("acceptHint")}</span>
            </form>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {isListing ? (
              <form action={unlistAction.bind(null, report.id)}>
                <button
                  type="submit"
                  className="rounded-full border border-ink-600 px-4 py-2 text-sm text-sand-200 hover:border-aqua-500"
                >
                  {t("unlist")}
                </button>
              </form>
            ) : null}
            {isBooking ? (
              <form action={escalateAction.bind(null, report.id)}>
                <button
                  type="submit"
                  className="rounded-full border border-ink-600 px-4 py-2 text-sm text-sand-200 hover:border-aqua-500"
                >
                  {t("escalate")}
                </button>
              </form>
            ) : null}
            <form action={strikeAction.bind(null, report.id)}>
              <button
                type="submit"
                className="rounded-full border border-coral-500 px-4 py-2 text-sm text-coral-500 hover:bg-coral-500/10"
              >
                {t("strike")}
              </button>
            </form>
          </div>

          <form action={resolveAction.bind(null, report.id)} className="flex flex-col gap-2">
            <label className="text-sm font-medium text-sand-200">{t("reasonLabel")}</label>
            <textarea
              name="reason"
              required
              rows={2}
              className="rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-sand-100"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="w-fit rounded-full bg-jade-500 px-5 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                {t("resolve")}
              </button>
              <button
                type="submit"
                formAction={dismissAction.bind(null, report.id)}
                className="w-fit rounded-full border border-ink-600 px-5 py-2 text-sm text-sand-400 hover:border-sand-500"
              >
                {t("dismiss")}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <p className="border-t border-ink-700 pt-6 text-sand-400">
          {report.status} — {report.resolvedReason}
        </p>
      )}
    </section>
  );
}
