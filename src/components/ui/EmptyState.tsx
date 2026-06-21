import type { ReactNode } from "react";

/**
 * EmptyState — the one standard empty pattern (v3). Consumers pass already-translated
 * strings (primitives hold no copy). icon = neutral ink; primary action = brand button.
 */
export function EmptyState({
  icon,
  title,
  body,
  primaryAction,
  secondaryAction,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-card border border-border-subtle bg-surface-0 px-6 py-14 text-center ${className}`}
    >
      {icon ? <div className="text-ink-500">{icon}</div> : null}
      <h3 className="font-display text-lg font-semibold text-ink-900">{title}</h3>
      {body ? <p className="max-w-[34em] text-sm text-ink-700">{body}</p> : null}
      {primaryAction || secondaryAction ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {primaryAction}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
