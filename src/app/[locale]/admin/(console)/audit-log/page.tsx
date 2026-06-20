import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { AUDIT_LIMIT, AUDIT_TARGET_TYPES, listAuditAdmins, loadAuditLog } from "@/lib/admin/audit";
import { Link, redirect } from "@/i18n/navigation";

/**
 * Admin audit-log viewer (DESIGN_SPEC §9 B11, issue #36). Read-only window onto the
 * append-only AuditLog — every admin money/trust action (who/what/when/before→after).
 * Bounded to the newest AUDIT_LIMIT rows, filterable by admin + target type via a
 * plain GET form (server-side filtering, no client JS). Mirrors the other console pages.
 */
const bkk = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ adminId?: string; targetType?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const t = await getTranslations("Admin.AuditLog");
  const { adminId, targetType } = await searchParams;

  const [rows, admins] = await Promise.all([
    loadAuditLog({ adminId: adminId || undefined, targetType: targetType || undefined }),
    listAuditAdmins(),
  ]);

  const selectClass = "rounded border border-ink-700 bg-ink-800 px-2 py-1 text-sand-50";

  return (
    <section>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-sand-300">{t("subtitle")}</p>

      {/* GET filter bar — server-side filtering via query params */}
      <form className="mt-6 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-sand-400">{t("filterAdmin")}</span>
          <select name="adminId" defaultValue={adminId ?? ""} className={selectClass}>
            <option value="">{t("allAdmins")}</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sand-400">{t("filterTarget")}</span>
          <select name="targetType" defaultValue={targetType ?? ""} className={selectClass}>
            <option value="">{t("allTargets")}</option>
            {AUDIT_TARGET_TYPES.map((tt) => (
              <option key={tt} value={tt}>
                {tt}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-aqua-600 px-3 py-1.5 font-medium text-ink-900">
          {t("apply")}
        </button>
        <Link href="/admin/audit-log" className="px-2 py-1.5 text-sand-300 hover:text-sand-50">
          {t("clear")}
        </Link>
      </form>

      {rows.length === 0 ? (
        <p className="mt-8 text-sand-400">{t("empty")}</p>
      ) : (
        <>
          {rows.length === AUDIT_LIMIT && (
            <p className="mt-4 text-xs text-sand-400">{t("atCap", { n: AUDIT_LIMIT })}</p>
          )}
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-sand-400">
                <th className="py-2 pr-4">{t("colTime")}</th>
                <th className="py-2 pr-4">{t("colAdmin")}</th>
                <th className="py-2 pr-4">{t("colAction")}</th>
                <th className="py-2 pr-4">{t("colTarget")}</th>
                <th className="py-2">{t("colChanges")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink-800 align-top hover:bg-ink-800/40">
                  <td className="py-3 pr-4 text-sand-400">{bkk(r.createdAt)}</td>
                  <td className="py-3 pr-4 text-sand-300">{r.admin.displayName}</td>
                  <td className="py-3 pr-4 font-medium text-sand-100">{r.action}</td>
                  <td className="py-3 pr-4 text-sand-300">
                    {r.targetType}
                    <span className="block text-xs text-sand-400">{r.targetId.slice(0, 12)}…</span>
                  </td>
                  <td className="py-3">
                    {r.before || r.after ? (
                      <details>
                        <summary className="cursor-pointer text-sand-400 hover:text-sand-50">
                          {t("changesToggle")}
                        </summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-ink-800 p-2 text-xs text-sand-300">
                          {JSON.stringify({ before: r.before, after: r.after }, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-sand-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
