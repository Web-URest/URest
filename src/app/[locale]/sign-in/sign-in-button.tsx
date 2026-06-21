"use client";

import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

export function SignInButton({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const t = useTranslations("Auth");

  return (
    <button
      type="button"
      onClick={() => signIn("google", { redirectTo: callbackUrl })}
      className="rounded-full bg-teal-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-ink-700"
    >
      {t("signInWithGoogle")}
    </button>
  );
}
