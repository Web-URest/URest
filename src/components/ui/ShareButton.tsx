"use client";

import { useState } from "react";
import { Share } from "lucide-react";

/**
 * ShareButton — title-block share (v3). Web Share API where available, else copy-link
 * fallback with a transient "copied" state. Consumers pass translated labels.
 */
export function ShareButton({
  url,
  title,
  label,
  copiedLabel,
  className = "",
}: {
  url: string;
  title: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user cancelled or share failed — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold text-ink-900 underline-offset-4 hover:bg-surface-50 hover:underline ${className}`}
    >
      <Share size={16} />
      {copied ? copiedLabel : label}
    </button>
  );
}
