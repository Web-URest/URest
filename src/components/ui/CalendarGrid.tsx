"use client";

import { useTranslations } from "next-intl";

interface HostBlock {
  id: string;
  startDate: Date;
  endDate: Date;
}

const MONTHS_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const DAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** Diagonal stripe for ปิดเอง cells (tokens only — no invented hex). */
const BLOCKED_STRIPE = {
  backgroundImage:
    "repeating-linear-gradient(45deg, var(--color-border) 0, var(--color-border) 4px, var(--color-border-subtle) 4px, var(--color-border-subtle) 6px)",
} as const;

function ymdOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addMonth(ymd: string): { year: number; month: number } {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** Map every covered date → its block id (for unblock-on-tap). */
function buildBlockMap(blocks: readonly HostBlock[]): Map<string, string> {
  const map = new Map<string, string>();
  const DAY_MS = 86_400_000;
  for (const b of blocks) {
    for (let t = b.startDate.getTime(); t <= b.endDate.getTime(); t += DAY_MS) {
      map.set(new Date(t).toISOString().slice(0, 10), b.id);
    }
  }
  return map;
}

function MonthGrid({
  year,
  month,
  blockMap,
  today,
  onToggleDate,
  pending,
}: {
  year: number;
  month: number;
  blockMap: Map<string, string>;
  today: string;
  onToggleDate: (ymd: string, blockId: string | null) => void;
  pending: boolean;
}) {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = daysInMonth(year, month);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div>
      <p className="mb-3 text-center font-semibold text-ink-900">
        {MONTHS_TH[month]} {year}
      </p>
      <div className="grid grid-cols-7 gap-px text-center text-xs">
        {DAYS_TH.map((d) => (
          <span key={d} className="pb-1 font-semibold text-ink-900/50">
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={`empty-${i}`} />;
          const ymd = ymdOf(year, month, day);
          const isPast = ymd < today;
          const blockId = blockMap.get(ymd) ?? null;
          const isBlocked = blockId !== null;

          if (isPast) {
            return (
              <span
                key={ymd}
                className="flex h-9 items-center justify-center rounded-full text-sm text-ink-900/20"
              >
                {day}
              </span>
            );
          }

          return (
            <button
              key={ymd}
              type="button"
              disabled={pending}
              aria-pressed={isBlocked}
              onClick={() => onToggleDate(ymd, blockId)}
              style={isBlocked ? BLOCKED_STRIPE : undefined}
              className={[
                "flex h-9 items-center justify-center rounded-full text-sm transition duration-150 ease-out disabled:opacity-50",
                isBlocked
                  ? "text-ink-500 line-through"
                  : "text-ink-900 hover:bg-surface-50",
              ].join(" ")}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * CalendarGrid (host mode) — interactive 2-month grid for ปฏิทิน (PRODUCT_FLOWS §4.2).
 * Tap a free future day to block it (ปิดเอง), tap a blocked day to unblock — the
 * parent runs the add/remove server action via `onToggleDate(ymd, blockId)`
 * (`blockId` is the covering block when blocked, else `null`).
 *
 * "จองผ่าน U-Rest" booked dates are Phase 3 (the `Booking` model + its double-booking
 * GiST land then); this grid renders ว่าง / ปิดเอง only until that data exists.
 */
export function CalendarGrid({
  blocks,
  startMonth,
  onToggleDate,
  pending = false,
}: {
  blocks: readonly HostBlock[];
  startMonth?: string;
  onToggleDate: (ymd: string, blockId: string | null) => void;
  pending?: boolean;
}) {
  const t = useTranslations("Host");
  const base = startMonth ?? new Date().toISOString().slice(0, 7) + "-01";
  const blockMap = buildBlockMap(blocks);
  const today = new Date().toISOString().slice(0, 10);

  const m0 = new Date(`${base}T00:00:00Z`);
  const m1 = addMonth(base);

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 rounded-card border border-line bg-white p-5 sm:grid-cols-2">
        <MonthGrid
          year={m0.getUTCFullYear()}
          month={m0.getUTCMonth()}
          blockMap={blockMap}
          today={today}
          onToggleDate={onToggleDate}
          pending={pending}
        />
        <MonthGrid
          year={m1.year}
          month={m1.month}
          blockMap={blockMap}
          today={today}
          onToggleDate={onToggleDate}
          pending={pending}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-900/60">
        <span className="flex items-center gap-2">
          <span className="inline-block h-4 w-4 rounded-full border border-line bg-white" />
          {t("calendar.free")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-4 w-4 rounded-full" style={BLOCKED_STRIPE} />
          {t("calendar.blocked")}
        </span>
        <span className="flex items-center gap-2 text-ink-900/40">
          <span className="inline-block h-4 w-4 rounded-full bg-aqua-100" />
          {t("calendar.bookedSoon")}
        </span>
      </div>
    </div>
  );
}
