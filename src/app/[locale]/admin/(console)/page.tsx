import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { redirect } from "@/i18n/navigation";

/**
 * Admin console landing (placeholder shell). Guards independently of the layout
 * (a page must not trust the layout for auth). The approval queue (#14),
 * payouts (#25), disputes (#26), and reports (#27) hang off this surface and
 * each call `requireAdmin` in their own actions.
 */
export default async function AdminDashboardPage() {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const t = await getTranslations("Admin");

  return (
    <section>
      <h1 className="text-2xl font-bold">{t("dashboardTitle")}</h1>
      <p className="mt-2 text-ink-700">{t("dashboardIntro")}</p>
    </section>
  );
}
