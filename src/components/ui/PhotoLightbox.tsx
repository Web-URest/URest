"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

import { useOverlay } from "./use-overlay";
import { IconButton } from "./IconButton";

/**
 * PhotoLightbox — full-screen gallery overlay (v3). Keyboard ←/→ + Esc, counter,
 * focus-trap + scroll-lock via useOverlay. Portals to <body> (z-lane 80, above all).
 * Also reused for the concierge payment-QR zoom. Consumers pass translated a11y labels.
 */
export function PhotoLightbox({
  open,
  onClose,
  photos,
  startIndex = 0,
  closeLabel,
  prevLabel,
  nextLabel,
}: {
  open: boolean;
  onClose: () => void;
  photos: { url: string; alt?: string }[];
  startIndex?: number;
  closeLabel: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(startIndex);
  useOverlay({ open, onClose, containerRef: ref });

  useEffect(() => {
    if (open) setI(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setI((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setI((p) => Math.min(photos.length - 1, p + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

  if (!open || typeof document === "undefined") return null;
  const cur = photos[i];

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={closeLabel}
      tabIndex={-1}
      className="fixed inset-0 z-[80] flex flex-col bg-black/95 outline-none [animation:fade-in_150ms_ease-out]"
    >
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <IconButton label={closeLabel} tone="onScrim" onClick={onClose}>
          <X size={20} />
        </IconButton>
        <span className="text-sm tabular-nums">
          {i + 1} / {photos.length}
        </span>
        <span className="w-10" />
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 pb-6">
        {i > 0 ? (
          <IconButton
            label={prevLabel}
            tone="onScrim"
            className="absolute left-4 top-1/2 -translate-y-1/2"
            onClick={() => setI((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft size={22} />
          </IconButton>
        ) : null}
        {cur ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cur.url}
            alt={cur.alt ?? ""}
            className="max-h-full max-w-full rounded-photo object-contain"
          />
        ) : null}
        {i < photos.length - 1 ? (
          <IconButton
            label={nextLabel}
            tone="onScrim"
            className="absolute right-4 top-1/2 -translate-y-1/2"
            onClick={() => setI((p) => Math.min(photos.length - 1, p + 1))}
          >
            <ChevronRight size={22} />
          </IconButton>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
