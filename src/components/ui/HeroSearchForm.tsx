"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { DateRangeField } from "./DateRangeField";
import { GuestStepper } from "./GuestStepper";
import type { ActiveRegion } from "@/lib/listing/queries";

/**
 * HeroSearchForm — the interactive search on the landing hero. Destination +
 * dates + guests are selectable here, then navigate to /search with the same
 * query-param contract the search page reads (region/checkIn/checkOut/guests).
 * Reuses DateRangeField + GuestStepper; locale-aware router from @/i18n/navigation.
 */
export function HeroSearchForm({ regions }: { regions: ActiveRegion[] }) {
  const t = useTranslations("Home");
  const router = useRouter();
  const [regionSlug, setRegionSlug] = useState(regions[0]?.slug ?? "pattaya");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);

  function submit() {
    const qs = new URLSearchParams({ region: regionSlug, guests: String(guests) });
    if (checkIn) qs.set("checkIn", checkIn);
    if (checkOut) qs.set("checkOut", checkOut);
    router.push(`/search?${qs.toString()}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-7 max-w-[560px] rounded-2xl border border-sand-300 bg-white p-4 shadow-card"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="hero-region"
            className="text-xs font-semibold uppercase tracking-wide text-ink-900/60"
          >
            {t("searchDestination")}
          </label>
          <select
            id="hero-region"
            value={regionSlug}
            onChange={(e) => setRegionSlug(e.target.value)}
            className="rounded-input border border-line bg-sand-100 px-3 py-2 text-sm font-semibold text-ink-900 outline-none"
          >
            {regions.length === 0 ? (
              <option value="pattaya">{t("destinationDefault")}</option>
            ) : (
              regions.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.nameTh}
                </option>
              ))
            )}
          </select>
        </div>
        <GuestStepper value={guests} max={30} onChange={setGuests} />
      </div>
      <div className="mt-3">
        <DateRangeField
          checkIn={checkIn}
          checkOut={checkOut}
          onCheckInChange={setCheckIn}
          onCheckOutChange={setCheckOut}
        />
      </div>
      <button
        type="submit"
        className="mt-3 w-full rounded-full bg-aqua-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-aqua-600"
      >
        {t("searchCta")}
      </button>
    </form>
  );
}
