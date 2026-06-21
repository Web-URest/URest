"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * MobileNav — hamburger + slide-out drawer for the center nav links that are
 * hidden below md (Search, Become Host). Client-side; closes on navigate, overlay
 * tap, or Escape. Replaces the previously non-functional hamburger button.
 */
export function MobileNav() {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("menu")}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition duration-150 ease-out hover:bg-sand-100 md:hidden"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink-900/40"
          />
          <div className="absolute right-0 top-0 flex h-full w-72 max-w-[80%] flex-col gap-1 bg-sand-50 p-4 shadow-raised">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-lg text-ink-900">
                U<span className="text-aqua-500">·</span>Rest
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-700 transition hover:bg-sand-100"
              >
                <X size={20} />
              </button>
            </div>
            <Link
              href="/search"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-900 transition hover:bg-sand-100"
            >
              {t("search")}
            </Link>
            <Link
              href="/listings/new"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-900 transition hover:bg-sand-100"
            >
              {t("becomeHost")}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
