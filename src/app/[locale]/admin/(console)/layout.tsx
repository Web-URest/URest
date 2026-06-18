import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { Link, redirect } from "@/i18n/navigation";

import { AdminLogoutButton } from "./logout-button";

/**
 * Gate + ink "back-of-house" shell for the admin console (DESIGN_SPEC §5.9).
 *
 * The redirect here is UX convenience, NOT the security boundary — every admin
 * page and server action re-checks via `getAdmin`/`requireAdmin` (server
 * actions never run layouts). `getAdmin` reads only the admin cookie + the
 * `AdminUser` row, so a consumer session can never satisfy it.
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

  return (
    <div className="min-h-screen bg-ink-900 text-sand-50">
      <header className="flex items-center justify-between border-b border-ink-700 px-6 py-4">
        <span className="font-bold">{t("consoleTitle")}</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-sand-300">{admin?.displayName}</span>
          <AdminLogoutButton />
        </div>
      </header>
      <nav className="flex gap-5 border-b border-ink-700 px-6 py-2 text-sm">
        <Link href="/admin/approval-queue" className="text-sand-300 hover:text-sand-50">
          {t("nav.approvalQueue")}
        </Link>
        <Link href="/admin/payouts" className="text-sand-300 hover:text-sand-50">
          {t("nav.payouts")}
        </Link>
        <Link href="/admin/reviews" className="text-sand-300 hover:text-sand-50">
          {t("nav.reviews")}
        </Link>
        <Link href="/admin/unanswered-questions" className="text-sand-300 hover:text-sand-50">
          {t("nav.unanswered")}
        </Link>
      </nav>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
