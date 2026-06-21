"use client";

import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

export function SignInButton({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const t = useTranslations("Auth");

  return (
    <button
      type="button"
      onClick={() => signIn("google", { redirectTo: callbackUrl })}
      className="flex w-full items-center justify-center gap-2 rounded-pill border border-border bg-white px-6 py-3 font-semibold text-ink-900 transition duration-150 ease-out hover:bg-surface-50"
    >
      {t("signInWithGoogle")}
    </button>
  );
}
