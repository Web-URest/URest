import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { Link, redirect } from "@/i18n/navigation";

import { AdminLogoutButton } from "./logout-button";

/**
 * Gate + v3 light "back-of-house" shell for the admin console (supersedes the ink
 * §5.9 shell — the security boundary is the separate /admin + admin-cookie + role=ADMIN
 * + TOTP surface, not darkness).
 *
 * The redirect here is UX convenience, NOT the security boundary — every admin
 * page and server action re-checks via `getAdmin`/`requireAdmin` (server
 * actions never run layouts). `getAdmin` reads only the admin cookie + the
 * `role=ADMIN` `User` row, so a consumer session can never satisfy it.
 */
export default async function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const t = await getTranslations("Admin");

  const navCls =
    "rounded-input px-2.5 py-1 text-ink-700 transition hover:bg-surface-50 hover:text-ink-900";

  return (
    <div className="min-h-screen bg-surface-50 text-ink-900">
      <header className="flex items-center justify-between border-b border-border-subtle bg-white px-6 py-4">
        <span className="font-display font-bold text-ink-900">{t("consoleTitle")}</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-ink-500">{admin?.displayName}</span>
          <AdminLogoutButton />
        </div>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-border-subtle bg-white px-6 py-2 text-sm font-medium">
        <Link href="/admin/approval-queue" className={navCls}>
          {t("nav.approvalQueue")}
        </Link>
        <Link href="/admin/payouts" className={navCls}>
          {t("nav.payouts")}
        </Link>
        <Link href="/admin/reviews" className={navCls}>
          {t("nav.reviews")}
        </Link>
        <Link href="/admin/disputes" className={navCls}>
          {t("nav.disputes")}
        </Link>
        <Link href="/admin/unanswered-questions" className={navCls}>
          {t("nav.unanswered")}
        </Link>
        <Link href="/admin/audit-log" className={navCls}>
          {t("nav.auditLog")}
        </Link>
      </nav>
      <main className="mx-auto max-w-[1180px] px-6 py-8">{children}</main>
    </div>
  );
}
