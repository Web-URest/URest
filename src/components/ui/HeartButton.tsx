"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import { toggleSaveAction } from "@/app/[locale]/(protected)/saved/actions";

interface HeartButtonProps {
  listingId: string;
  initialSaved: boolean;
  /** Extra Tailwind classes. Defaults to card-overlay positioning. */
  className?: string;
  /** Called after a successful unsave (used by /saved page for undo). */
  onUnsaved?: () => void;
}

export function HeartButton({
  listingId,
  initialSaved,
  className,
  onUnsaved,
}: HeartButtonProps) {
  const t = useTranslations("SavedVillas");
  const [saved, setSaved] = useState(initialSaved);
  const [errorVisible, setErrorVisible] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    };
  }, []);

  function showError() {
    setErrorVisible(true);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setErrorVisible(false), 3000);
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const next = !saved;
    setSaved(next); // optimistic

    startTransition(async () => {
      const result = await toggleSaveAction(listingId, next);
      if (!result.ok) {
        setSaved(!next); // rollback
        if (result.error === "UNAUTHENTICATED") {
          router.push(`/sign-in?callbackUrl=${encodeURIComponent(pathname)}`);
        } else {
          showError();
        }
        return;
      }
      if (!next && onUnsaved) onUnsaved();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label={saved ? t("unsave") : t("save")}
        aria-pressed={saved}
        className={
          className ??
          "absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-card transition-opacity"
        }
        style={{ opacity: pending ? 0.7 : 1 }}
      >
        <span
          aria-hidden
          className={`text-lg ${saved ? "text-coral-500" : "text-ink-900/40"}`}
        >
          {saved ? "♥" : "♡"}
        </span>
      </button>
      {errorVisible && (
        <p
          role="alert"
          className="absolute right-0 top-11 z-10 whitespace-nowrap rounded-md bg-white px-2.5 py-1 text-xs text-coral-600 shadow-card"
        >
          {t("errorGeneric")}
        </p>
      )}
    </div>
  );
}
