/**
 * StatCard — a single KPI tile for the host overview (PRODUCT_FLOWS §4.2 ภาพรวม).
 * The number uses the Chonburi display face (big-money role, DESIGN_SPEC §3).
 * A `null` value renders the em-dash zero-state — booking-derived KPIs (revenue,
 * bookings, response rate, rating) stay empty until Phase 3 data lands, never a
 * fabricated number. Presentational + shared (server-renderable).
 */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-white p-4 shadow-card">
      <p className="text-sm font-medium text-ink-700">{label}</p>
      <p className="font-display text-2xl text-ink-900">{value ?? "—"}</p>
      {hint && <p className="mt-1 text-xs text-ink-900/50">{hint}</p>}
    </div>
  );
}
