import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { Link, redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { kycDocumentSignedUrl } from "@/lib/kyc/storage";
import { NEEDS_INFO_ITEM_KEYS } from "@/lib/kyc/review";
import { photoUrl } from "@/lib/listing/upload";

import { approveAction, legalBadgeAction, needsInfoAction, rejectAction } from "../actions";

/**
 * Listing review detail (PRODUCT_FLOWS §5.1). The §5.1 "drawer" rendered as a
 * full server page (no modal infra). KYC docs are served via short-lived signed
 * URLs generated here — r2Keys never reach the client and are never logged.
 */

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const { submissionId } = await params;
  const t = await getTranslations("Admin.ListingApprovalQueue");
  const docLabels = await getTranslations("Wizard.kycDocTypes");

  const submission = await prisma.kycSubmission.findUnique({
    where: { id: submissionId },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          address: true,
          mapLat: true,
          mapLng: true,
          legalBadgeAt: true,
          status: true,
          photos: { orderBy: { sortOrder: "asc" }, select: { id: true, r2Key: true } },
        },
      },
      user: { select: { displayName: true } },
      documents: { select: { id: true, type: true, r2Key: true } },
    },
  });

  if (!submission || !submission.listing) notFound();
  const { listing } = submission;

  const payout = await prisma.payoutAccount.findFirst({
    where: { userId: submission.userId },
    select: { accountName: true },
  });

  // Short-lived signed GETs (5 min) — built server-side, never exposed as r2Key.
  const docs = await Promise.all(
    submission.documents.map(async (d) => ({
      id: d.id,
      type: d.type,
      url: await kycDocumentSignedUrl(d.r2Key),
    })),
  );

  const mapsUrl =
    listing.mapLat != null && listing.mapLng != null
      ? `https://www.google.com/maps?q=${listing.mapLat},${listing.mapLng}`
      : null;

  const pending = submission.status === "PENDING_REVIEW";

  return (
    <section className="flex flex-col gap-8">
      <div>
        <Link href="/admin/approval-queue" className="text-sm text-ink-500 hover:text-ink-700">
          {t("backToQueue")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{listing.title}</h1>
        <p className="mt-1 text-ink-700">{submission.user.displayName}</p>
      </div>

      {/* KYC documents */}
      <div>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-700">
          {t("docsTitle")}
        </h2>
        <p className="mb-3 text-xs text-ink-500">{t("docExpiresHint")}</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {docs.map((d) => (
            <a
              key={d.id}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-border p-2 hover:border-aqua-500"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.url} alt={docLabels(d.type)} className="h-40 w-full rounded-lg object-cover" />
              <span className="mt-2 block text-xs text-ink-700">{docLabels(d.type)}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Listing photos */}
      {listing.photos.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-700">
            {t("photosTitle")}
          </h2>
          <div className="flex gap-3 overflow-x-auto">
            {listing.photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={photoUrl(p.r2Key)}
                alt=""
                className="h-32 w-44 shrink-0 rounded-lg object-cover"
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Map + payout name (§5.1 spot checks) */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-700">
            {t("mapTitle")}
          </h2>
          <p className="text-ink-700">{listing.address || "—"}</p>
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-aqua-500 hover:underline"
            >
              {listing.mapLat}, {listing.mapLng}
            </a>
          ) : null}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-700">
            {t("payoutNameLabel")}
          </h2>
          <p className="text-ink-900">{payout?.accountName ?? "—"}</p>
        </div>
      </div>

      {/* Review checklist (spot-check reminders) */}
      <ul className="space-y-1 text-sm text-ink-700">
        <li className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          {t("checklistTitle")}
        </li>
        <li>· {t("checkNamesMatch")}</li>
        <li>· {t("checkLegible")}</li>
        <li>· {t("checkPhotosReal")}</li>
        <li>· {t("checkMapCoherent")}</li>
      </ul>

      {/* Legal badge — independent of approval (AC#3) */}
      <div className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold text-ink-900">{t("legalBadgeTitle")}</h2>
        <p className="mt-1 text-xs text-ink-500">{t("legalBadgeIntro")}</p>
        <div className="mt-3 flex items-center gap-3">
          {listing.legalBadgeAt ? (
            <span className="rounded-full bg-jade-500/20 px-2 py-0.5 text-xs text-jade-500">
              {t("badgeGranted")}
            </span>
          ) : null}
          <form action={legalBadgeAction.bind(null, listing.id, true)}>
            <button
              type="submit"
              className="rounded border border-border px-3 py-1 text-xs text-ink-700 hover:border-jade-500"
            >
              {t("grantBadge")}
            </button>
          </form>
          <form action={legalBadgeAction.bind(null, listing.id, false)}>
            <button
              type="submit"
              className="rounded border border-border px-3 py-1 text-xs text-ink-500 hover:border-ink-900"
            >
              {t("refuseBadge")}
            </button>
          </form>
        </div>
      </div>

      {/* Decision (only while PENDING_REVIEW) */}
      {pending ? (
        <div className="flex flex-col gap-6 border-t border-border pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700">
            {t("decisionTitle")}
          </h2>

          <form action={approveAction.bind(null, submission.id)}>
            <button
              type="submit"
              className="rounded-full bg-aqua-600 px-5 py-2 text-sm font-medium text-white hover:bg-aqua-500"
            >
              {t("approve")}
            </button>
          </form>

          {/* Needs-info: itemized checklist */}
          <form action={needsInfoAction.bind(null, submission.id)} className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink-700">{t("needsInfoTitle")}</p>
            <p className="text-xs text-ink-500">{t("needsInfoIntro")}</p>
            {NEEDS_INFO_ITEM_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <label className="flex min-w-[16rem] items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" name="items" value={key} />
                  {t(`items.${key}`)}
                </label>
                <input
                  type="text"
                  name={`note:${key}`}
                  placeholder={t("itemNotePlaceholder")}
                  className="flex-1 rounded border border-border bg-surface-50 px-2 py-1 text-xs text-ink-900 placeholder:text-ink-500"
                />
              </div>
            ))}
            <button
              type="submit"
              className="mt-1 w-fit rounded-full border border-border px-5 py-2 text-sm text-ink-700 hover:border-aqua-500"
            >
              {t("sendNeedsInfo")}
            </button>
          </form>

          {/* Reject: reason required */}
          <form action={rejectAction.bind(null, submission.id)} className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink-700">{t("reasonLabel")}</label>
            <textarea
              name="reason"
              required
              rows={2}
              className="rounded-xl border border-border bg-surface-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500"
            />
            <button
              type="submit"
              className="w-fit rounded-full border border-coral-500 px-5 py-2 text-sm text-coral-500 hover:bg-coral-500/10"
            >
              {t("reject")}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
