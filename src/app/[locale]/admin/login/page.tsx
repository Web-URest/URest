import { getTranslations } from "next-intl/server";

import { AdminLoginForm } from "./login-form";

/**
 * Public admin sign-in (the one /admin route that is NOT gated). v3 light chrome.
 * The boundary is the distinct /admin surface + separate credentials + TOTP, no
 * self-signup, no consumer providers (ADR-007/010) — not darkness.
 */
export default async function AdminLoginPage() {
  const t = await getTranslations("Admin");

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-surface-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-white p-8 shadow-card">
        <h1 className="text-2xl font-bold text-ink-900">{t("loginTitle")}</h1>
        <p className="mt-1 mb-6 text-sm text-ink-700">{t("loginSubtitle")}</p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
