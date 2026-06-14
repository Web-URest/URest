import { useTranslations } from "next-intl";
import { formatSatang } from "@/lib/money";

/**
 * VillaCard — the most-reused card (DESIGN_SPEC §5.1). Photo (3:2) with ♡ save +
 * verified badge, name (Chonburi), meta line, up-to-3 amenity chips (+N), price row
 * with weekend hint and rating. Until a real photo exists, the placeholder is a layered
 * aqua/sand "caustics" gradient (never a gray box), hue-varied per villa.
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

const CAUSTICS =
  "radial-gradient(120% 80% at 20% 10%, var(--color-aqua-300), transparent 60%)," +
  "radial-gradient(120% 90% at 90% 100%, var(--color-aqua-100), transparent 55%)," +
  "linear-gradient(160deg, var(--color-aqua-500), var(--color-sand-100))";

export function VillaCard({ villa }: { villa: Villa }) {
  const t = useTranslations("VillaCard");
  const shown = villa.amenities.slice(0, 3);
  const extra = villa.amenities.length - shown.length;

  return (
    <article className="overflow-hidden rounded-card bg-white shadow-card">
      <div className="relative aspect-[3/2]">
        <div
          role="img"
          aria-label={villa.name}
          className="absolute inset-0 rounded-photo bg-cover bg-center"
          style={{
            backgroundImage: villa.imageUrl ? `url(${villa.imageUrl})` : CAUSTICS,
            filter: villa.imageUrl ? undefined : `hue-rotate(${villa.hueDeg ?? 0}deg)`,
          }}
        />
        {villa.verified ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-jade-500 shadow-card">
            {t("verified")} ✓
          </span>
        ) : null}
        <span
          aria-hidden
          className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow-card ${
            villa.saved ? "text-coral-500" : "text-ink-900/40"
          }`}
        >
          {villa.saved ? "♥" : "♡"}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-4">
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
