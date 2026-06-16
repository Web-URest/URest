"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

const AMENITY_FILTERS = [
  { key: "PRIVATE_POOL", label: "filterPool" },
  { key: "KARAOKE", label: "filterKaraoke" },
  { key: "BBQ", label: "filterBbq" },
  { key: "PET_FRIENDLY", label: "filterPet" },
] as const;

const SORT_OPTIONS = [
  { value: "price_asc", label: "sortPriceAsc" },
  { value: "price_desc", label: "sortPriceDesc" },
  { value: "rating", label: "sortRating" },
] as const;

export function SearchFilters() {
  const t = useTranslations("Search");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentAmenities = searchParams.get("amenities")?.split(",").filter(Boolean) ?? [];
  const currentSort = searchParams.get("sort") ?? "price_asc";
  const isInstant = searchParams.get("instant") === "1";

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleAmenity(key: string) {
    const next = currentAmenities.includes(key)
      ? currentAmenities.filter((a) => a !== key)
      : [...currentAmenities, key];
    updateParams({ amenities: next.join(",") || null });
  }

  function toggleInstant() {
    updateParams({ instant: isInstant ? null : "1" });
  }

  function setSort(value: string) {
    updateParams({ sort: value });
  }

  const chipBase =
    "rounded-full border px-3 py-1.5 text-xs font-semibold transition cursor-pointer";
  const chipActive = "border-teal-600 bg-aqua-100 text-teal-600";
  const chipInactive = "border-line bg-white text-ink-900 hover:border-teal-600";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Instant book */}
      <button
        type="button"
        onClick={toggleInstant}
        className={`${chipBase} ${isInstant ? chipActive : chipInactive}`}
      >
        {t("filterInstant")}
      </button>

      {/* Amenity chips */}
      {AMENITY_FILTERS.map(({ key, label }) => {
        const active = currentAmenities.includes(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggleAmenity(key)}
            className={`${chipBase} ${active ? chipActive : chipInactive}`}
          >
            {t(label)}
          </button>
        );
      })}

      {/* Sort */}
      <select
        value={currentSort}
        onChange={(e) => setSort(e.target.value)}
        className="ml-auto rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 outline-none transition hover:border-teal-600"
        aria-label={t("sortLabel")}
      >
        {SORT_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {t(label)}
          </option>
        ))}
      </select>
    </div>
  );
}
