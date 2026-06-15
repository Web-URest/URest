import { useTranslations } from "next-intl";

import { SignInButton } from "./sign-in-button";

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const t = useTranslations("Auth");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-3xl text-ink-900">{t("signInTitle")}</h1>
      <p className="max-w-sm text-ink-700">{t("signInSubtitle")}</p>
      <SignInButtonWrapper searchParams={searchParams} />
    </main>
  );
}

async function SignInButtonWrapper({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl: raw } = await searchParams;
  // Guard against open-redirect via user-supplied query param.
  const callbackUrl =
    raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  return <SignInButton callbackUrl={callbackUrl} />;
}
