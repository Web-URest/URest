import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/guards";

import { VerifyPhoneForm } from "./verify-phone-form";

/**
 * Verification-ladder step 2 (PRODUCT_FLOWS §1). Minimal, dev-provable surface:
 * enter phone → enter code → verified. The polished OTP-in-booking-flow UI is a
 * Phase-3 concern (#21) — this page only exercises the ladder mechanism.
 */
export default async function VerifyPhonePage() {
  const t = await getTranslations("Otp");
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-md px-4 py-12 md:px-6">
      <h1 className="font-display text-3xl text-ink-900">{t("title")}</h1>
      <p className="mt-2 text-ink-900/70">{t("subtitle")}</p>

      <div className="mt-8">
        {user.phoneVerifiedAt ? (
          <p className="text-jade-500 font-semibold">{t("alreadyVerified")}</p>
        ) : (
          <VerifyPhoneForm />
        )}
      </div>
    </main>
  );
}
