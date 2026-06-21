import { useTranslations } from "next-intl";
import { formatSatang } from "@/lib/money";

/**
 * VillaCard — the most-reused card (v3 "AirBnB skin"). Photo (3:2) with ♡ save +
 * verified badge, name, meta line, up-to-3 amenity chips (+N), price row with weekend
 * hint and rating. Until a real photo exists, the placeholder is a calm neutral-grey
 * wash (never a colored smear). `chrome="bare"` (AirBnB grid look — no border/shadow,
 * hover lift on the photo) vs `chrome="card"` (bordered white card, e.g. a feature slot).
 *
 * Money in is integer satang; formatted at the edge via formatSatang (CLAUDE.md rule 1).
 * Presentational: the ♡ shows `saved` state; optimistic toggling is a consumer concern.
 */
export type Villa = {
  name: string;
  region: string;
  sleeps: number;
  bedrooms: number;
  amenities: string[];
  pricePerNightSatang: number;
  weekendPriceSatang?: number;
  rating?: number;
  reviewCount?: number;
  verified?: boolean;
  imageUrl?: string;
  saved?: boolean;
  /** Hue rotation (deg) so caustics placeholders vary between villas. */
  hueDeg?: number;
};

/**
 * Props for the card component.
 * `heartSlot` replaces the default aria-hidden heart span with an interactive
 * element — consumers (search, detail, saved pages) inject a HeartButton here.
 */
export type VillaCardProps = {
  villa: Villa;
  /** Replaces the static heart span with an interactive toggle. */
  heartSlot?: React.ReactNode;
  /** "bare" = AirBnB grid look (no chrome, hover-lift photo); "card" = bordered white card. */
  chrome?: "card" | "bare";
};

// Calm neutral-grey stand-in until a real photo exists (never a colored smear).
const PLACEHOLDER =
  "linear-gradient(150deg, var(--color-surface-100) 0%, var(--color-surface-50) 100%)";

export function VillaCard({ villa, heartSlot, chrome = "card" }: VillaCardProps) {
  const t = useTranslations("VillaCard");
  const shown = villa.amenities.slice(0, 3);
  const extra = villa.amenities.length - shown.length;
  const bare = chrome === "bare";

  return (
    <article
      className={
        bare
          ? "group"
          : "overflow-hidden rounded-card border border-border-subtle bg-white shadow-card transition duration-150 ease-out hover:shadow-raised"
      }
    >
      <div
        className={`relative aspect-[3/2] overflow-hidden ${bare ? "rounded-photo" : ""}`}
      >
        <div
          role="img"
          aria-label={villa.name}
          className={`absolute inset-0 bg-cover bg-center transition duration-300 ease-out ${
            bare ? "rounded-photo group-hover:scale-[1.03]" : ""
          }`}
          style={{
            backgroundImage: villa.imageUrl ? `url(${villa.imageUrl})` : PLACEHOLDER,
          }}
        />
        {villa.verified ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-trust-500 shadow-card">
            {t("verified")} ✓
          </span>
        ) : null}
        {heartSlot ?? (
          <span
            aria-hidden
            className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow-card ${
              villa.saved ? "text-brand-500" : "text-ink-500"
            }`}
          >
            {villa.saved ? "♥" : "♡"}
          </span>
        )}
      </div>

      <div className={`flex flex-col gap-2 ${bare ? "pt-3" : "p-4"}`}>
        <h3 className="font-display text-lg text-ink-900">{villa.name}</h3>
        <p className="text-sm text-ink-700">
          {villa.region} · {t("sleeps", { count: villa.sleeps })} ·{" "}
          {t("bedrooms", { count: villa.bedrooms })}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {shown.map((a) => (
            <span
              key={a}
              className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs text-ink-700"
            >
              {a}
            </span>
          ))}
          {extra > 0 ? (
            <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs text-ink-700">
              {t("moreAmenities", { count: extra })}
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex items-end justify-between">
          <div>
            <span className="font-display text-xl text-ink-900">
              {formatSatang(villa.pricePerNightSatang)}
            </span>
            <span className="text-sm text-ink-700"> {t("perNight")}</span>
            {villa.weekendPriceSatang != null ? (
              <span className="ml-2 text-xs text-ink-900/60">
                {t("weekend")} {formatSatang(villa.weekendPriceSatang)}
              </span>
            ) : null}
          </div>
          {villa.rating != null ? (
            <span className="text-sm font-semibold text-ink-900">
              <span className="text-gold-400">★</span> {villa.rating}{" "}
              <span className="font-normal text-ink-900/60">
                {t("reviews", { count: villa.reviewCount ?? 0 })}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
