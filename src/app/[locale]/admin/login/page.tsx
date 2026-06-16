import { getTranslations } from "next-intl/server";

import { AdminLoginForm } from "./login-form";

/**
 * Public admin sign-in (the one /admin route that is NOT gated). Ink
 * "back-of-house" chrome (DESIGN_SPEC §5.9). Separate credentials + TOTP, no
 * self-signup, no consumer providers (ADR-007/010).
 */
export default async function AdminLoginPage() {
  const t = await getTranslations("Admin");

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-ink-900 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl bg-ink-900 p-8 ring-1 ring-ink-700">
        <h1 className="text-2xl font-bold text-sand-50">{t("loginTitle")}</h1>
        <p className="mt-1 mb-6 text-sm text-sand-300">{t("loginSubtitle")}</p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
