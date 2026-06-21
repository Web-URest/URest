import { useTranslations } from "next-intl";

import { SignInButton } from "./sign-in-button";

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const t = useTranslations("Auth");

  return (
    <main className="flex min-h-[80vh] items-center justify-center bg-surface-50 px-4 py-16">
      <div className="w-full max-w-[420px] rounded-modal border border-border-subtle bg-white p-8 text-center shadow-card">
        <h1 className="font-display text-2xl font-bold text-ink-900">{t("signInTitle")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-700">{t("signInSubtitle")}</p>
        <div className="mt-6 flex flex-col items-stretch gap-3">
          <SignInButtonWrapper searchParams={searchParams} />
        </div>
      </div>
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
