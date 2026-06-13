"use client";

import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

export function SignInButton() {
  const t = useTranslations("Auth");

  return (
    <button
      type="button"
      onClick={() => signIn("line", { redirectTo: "/" })}
      className="rounded-full bg-teal-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-ink-700"
    >
      {t("signInWithLine")}
    </button>
  );
}
