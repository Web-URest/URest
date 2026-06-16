"use client";

import { useTranslations } from "next-intl";

interface CalendarBlock {
  startDate: Date;
  endDate: Date;
}

interface PriceCalendarProps {
  calendarBlocks: CalendarBlock[];
  /** First month to show, YYYY-MM-DD */
  startMonth?: string;
}

const MONTHS_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const DAYS_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addMonths(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function buildBlockedSet(blocks: CalendarBlock[]): Set<string> {
  const set = new Set<string>();
  const DAY_MS = 86_400_000;
  for (const b of blocks) {
    const start = b.startDate.getTime();
    const end = b.endDate.getTime();
    for (let t = start; t <= end; t += DAY_MS) {
      set.add(new Date(t).toISOString().slice(0, 10));
    }
  }
  return set;
}

function MonthGrid({ year, month, blocked }: { year: number; month: number; blocked: Set<string> }) {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = daysInMonth(year, month);
  const today = isoDate(new Date());

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
          const ymd = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isPast = ymd < today;
          const isBlocked = blocked.has(ymd);
          return (
            <span
              key={ymd}
              className={[
                "flex h-8 items-center justify-center rounded-full text-sm",
                isPast ? "text-ink-900/20" : "",
                isBlocked && !isPast
                  ? "bg-sand-300 text-ink-900/40 line-through"
                  : !isPast
                    ? "text-ink-900"
                    : "",
              ].join(" ")}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function PriceCalendar({ calendarBlocks, startMonth }: PriceCalendarProps) {
  const t = useTranslations("ListingDetail");
  const base = startMonth ?? new Date().toISOString().slice(0, 7) + "-01";
  const blocked = buildBlockedSet(calendarBlocks);

  const month0 = new Date(base + "T00:00:00Z");
  const month1Parts = addMonths(base, 1).split("-").map(Number);

  return (
    <section aria-label={t("sectionCalendar")}>
      <h2 className="mb-4 font-display text-xl text-ink-900">{t("sectionCalendar")}</h2>
      <div className="grid grid-cols-1 gap-6 rounded-card border border-line bg-white p-5 sm:grid-cols-2">
        <MonthGrid
          year={month0.getUTCFullYear()}
          month={month0.getUTCMonth()}
          blocked={blocked}
        />
        <MonthGrid
          year={month1Parts[0]!}
          month={(month1Parts[1]! - 1)}
          blocked={blocked}
        />
      </div>
      <p className="mt-2 flex items-center gap-2 text-xs text-ink-900/50">
        <span className="inline-block h-4 w-4 rounded-full bg-sand-300" />
        วันที่ไม่ว่าง
      </p>
    </section>
  );
}
