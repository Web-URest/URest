"use client";

import { Sparkles } from "lucide-react";
import { conciergeUi } from "./concierge-store";

/**
 * AskAiButton — opens the floating concierge (v3). `scope.listingId` scopes the chat to
 * a villa ("ask น้องเรสต์ about this villa"). Three presentations: a small `chip`, a
 * full-width `card` band (home/search), or an `inline` text link. Consumers pass the
 * translated label. If the widget isn't mounted (kill-switch / signed-out), open() is a
 * harmless no-op and the global launcher handles availability.
 */
type Variant = "chip" | "card" | "inline";

export function AskAiButton({
  label,
  scope,
  variant = "chip",
  sublabel,
  className = "",
}: {
  label: string;
  scope?: { listingId: string };
  variant?: Variant;
  sublabel?: string;
  className?: string;
}) {
  const onClick = () => conciergeUi.open({ listingId: scope?.listingId });

  if (variant === "card") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-4 rounded-modal border border-border-subtle bg-surface-50 px-5 py-4 text-left transition duration-150 ease-out hover:border-brand-500 hover:bg-brand-50 ${className}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          <Sparkles size={20} />
        </span>
        <span className="min-w-0">
          <span className="block font-display font-semibold text-ink-900">{label}</span>
          {sublabel ? <span className="block text-sm text-ink-500">{sublabel}</span> : null}
        </span>
      </button>
    );
  }

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline ${className}`}
      >
        <Sparkles size={16} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill border border-border bg-white px-3.5 py-2 text-sm font-semibold text-ink-900 transition duration-150 ease-out hover:border-brand-500 hover:text-brand-700 ${className}`}
    >
      <Sparkles size={16} className="text-brand-500" />
      {label}
    </button>
  );
}
