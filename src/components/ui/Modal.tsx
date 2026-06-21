"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useOverlay } from "./use-overlay";
import { IconButton } from "./IconButton";

/**
 * Modal — desktop-centered dialog (v3): Filters, "all amenities/photos", confirm-cancel,
 * host accept-request. Portals to <body> (z-lane 60). On small screens prefer BottomSheet.
 * Consumers pass already-translated `title` + `closeLabel`.
 */
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  size = "md",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  size?: Size;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlay({ open, onClose, containerRef: ref });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-modal bg-white shadow-overlay outline-none ${SIZES[size]}`}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="font-display text-base font-semibold text-ink-900">{title}</h2>
          <IconButton label={closeLabel} size="sm" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-border-subtle px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
