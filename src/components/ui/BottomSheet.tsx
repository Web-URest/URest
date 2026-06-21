"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useOverlay } from "./use-overlay";
import { IconButton } from "./IconButton";

/**
 * BottomSheet — mobile modal-from-bottom (v3): filters, map peek, search flow, login
 * sheet. Portals to <body> (z-lane 60), grab handle, backdrop, focus-trap + scroll-lock
 * via useOverlay. `snap="full"` fills the viewport; "auto" hugs content.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  closeLabel,
  snap = "auto",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  closeLabel: string;
  snap?: "auto" | "full";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlay({ open, onClose, containerRef: ref });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? closeLabel}
        tabIndex={-1}
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-t-modal bg-white shadow-overlay outline-none [animation:sheet-up_220ms_var(--ease-emphasized)] ${
          snap === "full" ? "h-[92dvh]" : "max-h-[88dvh]"
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <span
            aria-hidden
            className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-surface-100"
          />
          <h2 className="pt-2 font-display text-base font-semibold text-ink-900">
            {title}
          </h2>
          <IconButton label={closeLabel} size="sm" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div
          className="flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          style={{ paddingTop: "0.25rem" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
