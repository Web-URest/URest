import type { ReactNode } from "react";

/**
 * DataTable — the canonical admin/host table (v3). Replaces the hand-rolled
 * <table className="border-collapse"> blocks across the back-of-house queues. Light
 * tokens, tabular-friendly, server-renderable. Rows are passed as children (<tr> via
 * the exported Td/Th helpers or plain cells). When `isEmpty`, renders a centred panel.
 */
export interface Column {
  key: string;
  header: string;
  align?: "left" | "right";
  className?: string;
}

export function DataTable({
  columns,
  children,
  isEmpty = false,
  empty,
  dense = false,
}: {
  columns: Column[];
  children?: ReactNode;
  isEmpty?: boolean;
  empty?: ReactNode;
  dense?: boolean;
}) {
  if (isEmpty) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-0 px-6 py-12 text-center text-sm text-ink-500">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-border-subtle">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-50 text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 ${dense ? "py-2" : "py-3"} text-xs font-semibold uppercase tracking-wide text-ink-500 ${
                  c.align === "right" ? "text-right" : ""
                } ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Standard body cell. */
export function Td({
  children,
  align,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 align-middle text-ink-900 ${align === "right" ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/** Standard body row (hover highlight + hairline). */
export function Tr({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-border-subtle last:border-0 hover:bg-surface-50">
      {children}
    </tr>
  );
}
