import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { listOpenDisputes } from "@/lib/admin/dispute-review";
import { Link, redirect } from "@/i18n/navigation";

/**
 * Dispute queue (PRODUCT_FLOWS §5.3): open cases + armed appeals awaiting a final
 * decision, oldest-first. Mirrors the reports-queue admin page (ink chrome).
 */
const bkk = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(d);

export default async function DisputesQueuePage() {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const t = await getTranslations("Admin.Disputes");
  const rows = await listOpenDisputes();

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
              <th className="py-2 pr-4">{t("colCode")}</th>
              <th className="py-2 pr-4">{t("colListing")}</th>
              <th className="py-2 pr-4">{t("colGuest")}</th>
              <th className="py-2 pr-4">{t("colState")}</th>
              <th className="py-2 pr-4">{t("colAge")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.bookingId} className="border-b border-ink-800 hover:bg-ink-800/40">
                <td className="py-3 pr-4 text-sand-100">{d.code ?? "—"}</td>
                <td className="py-3 pr-4 text-sand-300">{d.listingTitle}</td>
                <td className="py-3 pr-4 text-sand-300">{d.guestName}</td>
                <td className="py-3 pr-4">
                  {d.awaitingAppeal ? (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                      {t("stateAppeal")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-coral-500/20 px-2 py-0.5 text-xs font-medium text-coral-500">
                      {t("stateOpen")}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-sand-400">{bkk(d.createdAt)}</td>
                <td className="py-3">
                  <Link
                    href={`/admin/disputes/${d.bookingId}`}
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
