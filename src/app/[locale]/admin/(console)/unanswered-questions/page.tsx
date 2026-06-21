import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/db";

import { dismissQuestionAction, suggestAsFaqAction } from "./actions";

/**
 * Admin unanswered-questions queue (PRODUCT_FLOWS §5.7).
 *
 * Groups OPEN rows by listing, sorted by frequency. Each question text is
 * deduplicated with a count. Admin can suggest-as-FAQ (creates a DRAFT
 * ListingFaqEntry the host fills in) or dismiss.
 */
export default async function UnansweredQuestionsPage() {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const t = await getTranslations("Admin.UnansweredQuestions");

  const rows = await prisma.unansweredQuestion.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

  const listingIds = [
    ...new Set(rows.map((r) => r.listingId).filter(Boolean)),
  ] as string[];

  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds } },
    select: { id: true, title: true },
  });
  const listingTitleMap = new Map(listings.map((l) => [l.id, l.title]));

  // Group by listingId → deduplicate question text → count
  type QuestionEntry = { id: string; text: string; count: number };
  type ListingGroup = {
    listingId: string | null;
    listingTitle: string;
    questions: QuestionEntry[];
  };

  const byKey = new Map<string, { listingId: string | null; rows: typeof rows }>();
  for (const row of rows) {
    const key = row.listingId ?? "__none__";
    if (!byKey.has(key)) byKey.set(key, { listingId: row.listingId, rows: [] });
    byKey.get(key)!.rows.push(row);
  }

  const groups: ListingGroup[] = [];
  for (const [, group] of byKey) {
    const byText = new Map<string, QuestionEntry>();
    for (const row of group.rows) {
      const existing = byText.get(row.questionText);
      if (existing) {
        existing.count += 1;
      } else {
        byText.set(row.questionText, { id: row.id, text: row.questionText, count: 1 });
      }
    }
    groups.push({
      listingId: group.listingId,
      listingTitle: group.listingId
        ? (listingTitleMap.get(group.listingId) ?? group.listingId)
        : t("listingUnknown"),
      questions: [...byText.values()].sort((a, b) => b.count - a.count),
    });
  }

  groups.sort(
    (a, b) =>
      b.questions.reduce((s, q) => s + q.count, 0) -
      a.questions.reduce((s, q) => s + q.count, 0),
  );

  return (
    <section>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-ink-700">{t("subtitle")}</p>

      {groups.length === 0 ? (
        <p className="mt-8 text-ink-500">{t("noQuestions")}</p>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <div key={group.listingId ?? "__none__"}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-700">
                {group.listingTitle}
              </h2>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {group.questions.map((q) => (
                    <tr
                      key={q.id}
                      className="border-b border-border-subtle hover:bg-surface-50"
                    >
                      <td className="py-3 pr-4 text-ink-900">{q.text}</td>
                      <td className="py-3 pr-4 text-right text-ink-500 tabular-nums">
                        {q.count}×
                      </td>
                      <td className="py-3 pr-2">
                        <form action={suggestAsFaqAction.bind(null, q.id)}>
                          <button
                            type="submit"
                            disabled={!group.listingId}
                            className="rounded bg-aqua-600 px-3 py-1 text-xs font-medium text-white hover:bg-aqua-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {t("suggestFaq")}
                          </button>
                        </form>
                      </td>
                      <td className="py-3">
                        <form action={dismissQuestionAction.bind(null, q.id)}>
                          <button
                            type="submit"
                            className="rounded border border-border px-3 py-1 text-xs text-ink-500 hover:border-ink-900 hover:text-ink-700"
                          >
                            {t("dismiss")}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
