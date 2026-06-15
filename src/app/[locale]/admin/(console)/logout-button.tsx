"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";

import { logoutAction } from "../actions";

export function AdminLogoutButton() {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await logoutAction();
          router.push("/admin/login");
        })
      }
      className="rounded-full border border-ink-700 px-4 py-1.5 text-sand-300 transition hover:bg-ink-700 disabled:opacity-50"
    >
      {t("logout")}
    </button>
  );
}
