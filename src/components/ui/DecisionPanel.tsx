import type { ReactNode } from "react";

/**
 * DecisionPanel — consistent container for admin decision forms (v3): approve/needs-info/
 * reject, dispute resolve, report triage. Titled, bordered, sticky on desktop when used
 * as the right rail of a two-column detail page. Consumer passes the translated title.
 */
export function DecisionPanel({
  title,
  children,
  sticky = true,
}: {
  title: string;
  children: ReactNode;
  sticky?: boolean;
}) {
  return (
    <aside
      className={`rounded-card border border-border bg-surface-0 shadow-card ${
        sticky ? "lg:sticky lg:top-6" : ""
      }`}
    >
      <h2 className="border-b border-border-subtle px-5 py-3 font-display text-base font-semibold text-ink-900">
        {title}
      </h2>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </aside>
  );
}
