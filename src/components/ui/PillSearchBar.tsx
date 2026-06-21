"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { useRouter } from "@/i18n/navigation";
import { DateRangeField } from "./DateRangeField";
import { GuestStepper } from "./GuestStepper";

/**
 * PillSearchBar — AirBnB's signature segmented search (v3). Where / When / Who segments
 * with popovers + a rose search button; submits to /search with the existing query
 * contract (region, checkIn, checkOut, guests). `variant="hero"` is the big landing bar;
 * "compact" is the condensed pill for the search header / scrolled topbar. All copy is
 * passed in (serializable strings) so server parents can render it.
 */
export interface PillSearchLabels {
  where: string;
  when: string;
  who: string;
  anywhere: string;
  anyDates: string;
  guestsUnit: string;
  search: string;
}

export interface RegionOption {
  slug: string;
  label: string;
}

type Seg = "where" | "when" | "who" | null;

export function PillSearchBar({
  variant = "hero",
  labels,
  regions,
  defaultRegion,
  defaultCheckIn = "",
  defaultCheckOut = "",
  defaultGuests = 1,
}: {
  variant?: "hero" | "compact";
  labels: PillSearchLabels;
  regions: RegionOption[];
  defaultRegion?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  defaultGuests?: number;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Seg>(null);
  const [region, setRegion] = useState<string | undefined>(defaultRegion);
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [guests, setGuests] = useState(defaultGuests);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function submit() {
    const p = new URLSearchParams();
    if (region) p.set("region", region);
    if (checkIn) p.set("checkIn", checkIn);
    if (checkOut) p.set("checkOut", checkOut);
    if (guests > 1) p.set("guests", String(guests));
    setOpen(null);
    router.push(`/search${p.toString() ? `?${p}` : ""}`);
  }

  const regionLabel = region
    ? (regions.find((r) => r.slug === region)?.label ?? labels.anywhere)
    : labels.anywhere;
  const dateLabel = checkIn && checkOut ? `${checkIn} – ${checkOut}` : labels.anyDates;
  const pad = variant === "hero" ? "py-2.5" : "py-1.5";

  const Segment = ({
    seg,
    title,
    value,
  }: {
    seg: Exclude<Seg, null>;
    title: string;
    value: string;
  }) => (
    <button
      type="button"
      onClick={() => setOpen((o) => (o === seg ? null : seg))}
      className={`flex flex-1 flex-col items-start rounded-pill px-5 text-left transition ${pad} ${
        open === seg ? "bg-surface-50" : "hover:bg-surface-50"
      }`}
    >
      <span className="text-xs font-semibold text-ink-900">{title}</span>
      <span className="truncate text-sm text-ink-500">{value}</span>
    </button>
  );

  return (
    <div ref={ref} className="relative w-full max-w-2xl">
      <div className="flex items-center rounded-pill border border-border bg-white shadow-raised">
        <Segment seg="where" title={labels.where} value={regionLabel} />
        <span className="h-8 w-px bg-border-subtle" />
        <Segment seg="when" title={labels.when} value={dateLabel} />
        <span className="h-8 w-px bg-border-subtle" />
        <div className="flex flex-1 items-center">
          <Segment
            seg="who"
            title={labels.who}
            value={`${guests} ${labels.guestsUnit}`}
          />
          <button
            type="button"
            onClick={submit}
            aria-label={labels.search}
            className="mr-2 flex h-11 shrink-0 items-center gap-2 rounded-pill bg-brand-500 px-4 font-semibold text-white transition duration-150 ease-out hover:bg-brand-600"
          >
            <Search size={18} />
            {variant === "hero" ? <span>{labels.search}</span> : null}
          </button>
        </div>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 rounded-modal border border-border-subtle bg-white p-4 shadow-overlay">
          {open === "where" ? (
            <div className="flex flex-wrap gap-2">
              {regions.map((r) => (
                <button
                  key={r.slug}
                  type="button"
                  onClick={() => {
                    setRegion(r.slug);
                    setOpen("when");
                  }}
                  className={`rounded-pill border px-3.5 py-2 text-sm transition ${
                    region === r.slug
                      ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                      : "border-border text-ink-900 hover:border-ink-900"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          ) : null}
          {open === "when" ? (
            <DateRangeField
              checkIn={checkIn}
              checkOut={checkOut}
              onCheckInChange={setCheckIn}
              onCheckOutChange={setCheckOut}
            />
          ) : null}
          {open === "who" ? (
            <GuestStepper value={guests} max={50} onChange={setGuests} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
