"use client";

import { useEffect, type RefObject } from "react";

/**
 * useOverlay — shared dialog/sheet behaviour (v3): body-scroll-lock, Escape-to-close,
 * optional focus trap, and focus restore to the opener. Used by Modal, BottomSheet,
 * PhotoLightbox, FiltersModal and the concierge mobile sheet. No new dependency.
 */
export function useOverlay({
  open,
  onClose,
  containerRef,
  trap = true,
}: {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  trap?: boolean;
}) {
  useEffect(() => {
    if (!open) return;

    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const el = containerRef.current;
    const focusables = (): HTMLElement[] =>
      el
        ? Array.from(
            el.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((x) => x.offsetParent !== null)
        : [];

    // move focus into the overlay
    (focusables()[0] ?? el)?.focus?.();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (trap && e.key === "Tab" && el) {
        const f = focusables();
        if (f.length === 0) {
          e.preventDefault();
          return;
        }
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open, onClose, containerRef, trap]);
}
