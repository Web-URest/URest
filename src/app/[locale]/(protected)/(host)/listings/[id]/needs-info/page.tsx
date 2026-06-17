import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { requireHostEligible } from "@/lib/auth/guards";
import { loadNeedsInfoSubmission } from "@/lib/kyc/review-host";
import { allItemsSatisfied, parseNeedsInfoItems } from "@/lib/kyc/review";

import { markItemAction, resubmitAction } from "./actions";

/**
 * Host NEEDS_INFO to-do (PRODUCT_FLOWS §5.1, AC#2). Renders only the items the
 * admin flagged, each with its note + a mark-done toggle. The 7 items are
 * heterogeneous, so the host fixes each through the relevant surface (edit page)
 * and marks it done here; resubmit is disabled until every item is satisfied.
 */

/** Items whose fix lives on the Edit Villa page get a contextual link. */
const EDIT_LINKED = new Set(["REMAP_PIN", "BANK_NAME_MISMATCH", "MORE_PHOTOS"]);

export default async function NeedsInfoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostEligible();
  const [t, submission] = await Promise.all([
    getTranslations("Host.needsInfo"),
    loadNeedsInfoSubmission(user.id, id),
  ]);

  if (!submission) notFound();

  const items = parseNeedsInfoItems(submission.needsInfoItems);
  const canResubmit = allItemsSatisfied(items);
  const itemLabels = await getTranslations("Admin.ListingApprovalQueue.items");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl text-ink-900">{t("title")}</h1>
        <p className="mt-2 text-ink-700">{t("intro")}</p>
      </header>

      <ul className="flex flex-col gap-3">
        {items.map((entry) => (
          <li
            key={entry.item}
            className="flex flex-col gap-2 rounded-2xl border border-ink-100 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-ink-900">{itemLabels(entry.item)}</span>
              <span
                className={
                  entry.satisfied
                    ? "rounded-full bg-jade-500/15 px-2 py-0.5 text-xs text-jade-600"
                    : "rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-700"
                }
              >
                {entry.satisfied ? t("done") : t("pending")}
              </span>
            </div>

            {entry.note ? (
              <p className="text-sm text-ink-700">
                <span className="text-ink-500">{t("adminNote")}: </span>
                {entry.note}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              {EDIT_LINKED.has(entry.item) ? (
                <Link
                  href={`/listings/${id}/edit`}
                  className="text-sm text-teal-600 hover:underline"
                >
                  {entry.item === "BANK_NAME_MISMATCH" ? t("gotoBank") : t("gotoMap")}
                </Link>
              ) : null}
              <form
                action={markItemAction.bind(
                  null,
                  id,
                  submission.id,
                  entry.item,
                  !entry.satisfied,
                )}
              >
                <button
                  type="submit"
                  className="rounded-full border border-ink-200 px-3 py-1 text-sm text-ink-700 hover:border-teal-600 hover:text-teal-600"
                >
                  {entry.satisfied ? t("markUndone") : t("markDone")}
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <form action={resubmitAction.bind(null, id)}>
        <button
          type="submit"
          disabled={!canResubmit}
          className="rounded-full bg-aqua-500 px-6 py-3 font-medium text-white hover:bg-aqua-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("resubmit")}
        </button>
        {!canResubmit ? (
          <p className="mt-2 text-sm text-ink-500">{t("resubmitDisabledHint")}</p>
        ) : null}
      </form>
    </div>
  );
}
