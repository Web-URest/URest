import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/auth";
import { DisputeReviewError, loadDisputeCase } from "@/lib/admin/dispute-review";
import { presignGet } from "@/lib/storage/r2";
import { formatSatang } from "@/lib/money";
import { Link } from "@/i18n/navigation";

import { finalizeRefundAction, resolveAppealAction, resolveDisputeAction } from "../actions";

/**
 * Dispute case view (§5.3). Shows the money state, the guest's evidence report(s)
 * (category/detail/photos), and THE unmasked chat thread (audited reveal, with the
 * PDPA notice). The decision form resolves an open dispute; an armed appeal (escrow
 * re-FROZEN) gets the final appeal-resolution form instead.
 */
const bkk = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(d);

export default async function DisputeCasePage({ params }: { params: Promise<{ bookingId: string }> }) {
  // The (console) layout already redirects unauthenticated admins; requireAdmin
  // gives a non-null principal for the audited thread reveal in loadDisputeCase.
  const admin = await requireAdmin();
  const { bookingId } = await params;
  const t = await getTranslations("Admin.Disputes");
  const cat = await getTranslations("Reports.categories");

  let data;
  try {
    data = await loadDisputeCase(admin, bookingId);
  } catch (e) {
    if (e instanceof DisputeReviewError) notFound();
    throw e;
  }
  const { dispute, reports, thread, refund } = data;

  // Sign each private-bucket evidence photo for a short-lived admin view.
  const photoUrlsByReport = await Promise.all(
    reports.map((r) => Promise.all(r.photoKeys.map((k) => presignGet({ key: k })))),
  );

  const isOpen = dispute.status === "OPEN";
  const awaitingAppeal = !isOpen && dispute.booking.escrowState === "FROZEN";
  const action = awaitingAppeal ? resolveAppealAction : resolveDisputeAction;
  // Final + a guest refund owed but not yet sent → offer the deferred refund send.
  const canFinalizeRefund =
    !isOpen && !awaitingAppeal && !!refund && refund.refundSatang > 0 && !refund.opnRefundId;

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href="/admin/disputes" className="text-sm text-ink-500 hover:text-ink-700">
          {t("backToQueue")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{dispute.booking.code ?? bookingId}</h1>
        <p className="mt-1 text-ink-700">{dispute.booking.listing.title}</p>
        <p className="mt-1 text-sm text-ink-500">
          {t("escrow")}: {dispute.booking.escrowState} · {t("total")}: {formatSatang(dispute.booking.totalSatang)}
        </p>
      </div>

      {/* Evidence reports */}
      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700">{t("evidence")}</h2>
        {reports.length === 0 ? (
          <p className="text-ink-500">{t("noReports")}</p>
        ) : (
          reports.map((r, i) => (
            <div key={r.id} className="flex flex-col gap-2">
              <p className="text-ink-900">
                <span className="font-medium">{cat(r.category)}</span> — {bkk(r.createdAt)}
              </p>
              <p className="whitespace-pre-wrap text-ink-700">{r.text}</p>
              {photoUrlsByReport[i]!.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photoUrlsByReport[i]!.map((url, j) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} src={url} alt="" className="aspect-square w-full rounded object-cover" />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* The chat evidence — sole bodyRaw read path */}
      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700">{t("chatEvidence")}</h2>
        <p className="rounded bg-surface-50 p-2 text-xs text-pending-700">{t("pdpaNotice")}</p>
        {thread.messages.length === 0 ? (
          <p className="text-ink-500">{t("noMessages")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {thread.messages.map((m) => (
              <li key={m.id} className="text-sm">
                <span className="text-ink-500">
                  {m.senderId === thread.guestId ? thread.guestName : thread.hostName} · {bkk(m.createdAt)}
                </span>
                <p className="text-ink-900">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Decision */}
      {isOpen || awaitingAppeal ? (
        <form action={action.bind(null, bookingId)} className="flex flex-col gap-4 border-t border-border pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700">
            {awaitingAppeal ? t("appealDecisionTitle") : t("decisionTitle")}
          </h2>
          <fieldset className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="radio" name="kind" value="RELEASED" defaultChecked required /> {t("kindReleased")}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="radio" name="kind" value="PARTIAL" /> {t("kindPartial")}
              <input
                type="number"
                name="refundPct"
                min={0}
                max={100}
                defaultValue={50}
                className="ml-2 w-20 rounded border border-border bg-surface-50 px-2 py-1 text-sm text-ink-900"
              />
              <span className="text-ink-500">%</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="radio" name="kind" value="REFUNDED" /> {t("kindRefunded")}
            </label>
          </fieldset>
          <button
            type="submit"
            className="w-fit rounded-full bg-jade-500 px-5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {t("decide")}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4 border-t border-border pt-6">
          <p className="text-ink-500">
            {dispute.status}
            {dispute.resolvedAt ? ` · ${bkk(dispute.resolvedAt)}` : ""}
          </p>
          {canFinalizeRefund && (
            <form action={finalizeRefundAction.bind(null, bookingId)} className="flex flex-col gap-2">
              <p className="text-sm text-ink-700">
                {t("refundOwed")}: {formatSatang(refund!.refundSatang)}
              </p>
              <button
                type="submit"
                className="w-fit rounded-full bg-jade-500 px-5 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                {t("finalizeRefund")}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
