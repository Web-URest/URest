import { useTranslations } from "next-intl";

import { SignInButton } from "./sign-in-button";

export default function SignInPage() {
  const t = useTranslations("Auth");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-3xl text-ink-900">{t("signInTitle")}</h1>
      <p className="max-w-sm text-ink-700">{t("signInSubtitle")}</p>
      <SignInButton />
    </main>
  );
}
