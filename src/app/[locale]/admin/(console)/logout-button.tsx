"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { logoutAction } from "../actions";

export function AdminLogoutButton() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => logoutAction(locale))}
      className="rounded-full border border-border px-4 py-1.5 text-ink-700 transition hover:bg-surface-50 disabled:opacity-50"
    >
      {t("logout")}
    </button>
  );
}
