"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Sparkles, X } from "lucide-react";

import { usePathname } from "@/i18n/navigation";
import { useConcierge, conciergeUi } from "@/components/ui/concierge-store";
import { useOverlay } from "@/components/ui/use-overlay";
import { IconButton } from "@/components/ui/IconButton";
import { ConciergeChat } from "./ConciergeChat";

/**
 * ConciergeWidget — the floating AI concierge shell (v3, presentation only). Rose FAB +
 * a desktop anchored panel / mobile bottom-sheet that embeds the existing ConciergeChat.
 * Open state + listing scope come from the concierge-store (opened by the Topbar/landing/
 * listing triggers). The SSE/confirm plumbing is untouched. Self-hides on the deep-link
 * /concierge page, the admin console, and /styleguide.
 */
export function ConciergeWidget() {
  const t = useTranslations("Concierge");
  const { open, scopedListingId } = useConcierge();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Mobile = modal sheet (trap + scroll-lock); desktop = non-modal panel.
  useOverlay({
    open,
    onClose: conciergeUi.close,
    containerRef: ref,
    trap: isMobile,
    lockScroll: isMobile,
  });

  const hidden =
    pathname === "/concierge" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/styleguide");
  if (hidden || typeof document === "undefined") return null;

  return createPortal(
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => conciergeUi.open()}
          aria-label={t("launcherLabel")}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+var(--space-bottomtab)+1rem)] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-overlay transition duration-150 ease-out hover:bg-brand-600 md:bottom-6"
        >
          <Sparkles size={24} />
        </button>
      ) : null}

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[55] bg-black/40 md:hidden"
            onClick={conciergeUi.close}
            aria-hidden
          />
          <div
            ref={ref}
            role="dialog"
            aria-modal={isMobile ? "true" : "false"}
            aria-label={t("pageTitle")}
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-[60] flex h-[88dvh] flex-col overflow-hidden rounded-t-modal bg-white shadow-overlay outline-none [animation:sheet-up_220ms_var(--ease-emphasized)] md:inset-auto md:bottom-6 md:right-5 md:h-[640px] md:max-h-[calc(100dvh-7rem)] md:w-[400px] md:rounded-modal md:[animation:pop-in_180ms_var(--ease-standard)]"
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <span className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-white">
                  <Sparkles size={14} />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="font-display text-sm font-semibold text-ink-900">
                    {t("pageTitle")}
                  </span>
                  <span className="text-xs text-ink-500">{t("headerSubtitle")}</span>
                </span>
              </span>
              <IconButton label={t("closeLabel")} size="sm" onClick={conciergeUi.close}>
                <X size={18} />
              </IconButton>
            </div>
            <ConciergeChat
              key={scopedListingId ?? "global"}
              scopedListingId={scopedListingId}
              embedded
            />
          </div>
        </>
      ) : null}
    </>,
    document.body,
  );
}
