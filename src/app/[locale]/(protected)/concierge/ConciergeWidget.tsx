"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, X } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { ConciergeChat } from "./ConciergeChat";

/**
 * ConciergeWidget — the floating AI assistant (replaces the old /concierge nav tab).
 * A launcher button (bottom-right); opening it reveals a chat panel hosting
 * ConciergeChat, which bootstraps its own session via /api/concierge/chat. Hidden on
 * the full-page /concierge route to avoid a double chat. Only mounted for signed-in
 * users with the kill-switch off (see ConciergeLauncher).
 */
export function ConciergeWidget() {
  const t = useTranslations("Concierge");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname === "/concierge") return null;

  return open ? (
    <div className="fixed bottom-4 right-4 z-50 flex h-[600px] max-h-[calc(100dvh-2rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-sand-100 shadow-raised">
      <header className="flex items-center justify-between gap-3 bg-ink-900 px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-aqua-500" />
          <p className="font-display text-sm font-semibold text-white">{t("pageTitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("closeLabel")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>
      </header>
      <ConciergeChat />
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={t("launcherLabel")}
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-aqua-500 text-white shadow-raised transition hover:bg-aqua-600"
    >
      <Sparkles size={24} />
    </button>
  );
}
