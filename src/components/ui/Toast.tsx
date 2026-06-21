"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

/**
 * Toast — snackbar for optimistic actions (v3): save/unsave undo, "saved instantly"
 * host edits. Mounted once via <ToastProvider> in the locale layout. Dark ink pill,
 * white text, optional inline action; bottom-center (above the BottomTabBar) on mobile,
 * bottom-left on desktop. aria-live carries the meaning (color is secondary).
 */
type ToastTone = "success" | "error" | "info";

interface ToastInput {
  message: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ActiveToast extends ToastInput {
  id: number;
}

const DOT: Record<ToastTone, string> = {
  success: "bg-trust-300",
  error: "bg-error-500",
  info: "bg-ink-500",
};

const ToastCtx = createContext<{ show: (t: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = ++idRef.current;
      setToasts((cur) => [...cur, { ...t, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), t.durationMs ?? 4000),
      );
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--space-bottomtab)+1rem)] z-[70] flex flex-col items-center gap-2 px-4 sm:left-6 sm:right-auto sm:items-start">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex items-center gap-3 rounded-pill bg-ink-900 px-4 py-2.5 text-sm text-white shadow-overlay [animation:fade-up_200ms_var(--ease-standard)]"
          >
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${DOT[t.tone ?? "info"]}`}
            />
            <span>{t.message}</span>
            {t.actionLabel && t.onAction ? (
              <button
                type="button"
                className="font-semibold text-white underline underline-offset-2"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="dismiss"
              onClick={() => dismiss(t.id)}
              className="text-white/60 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
