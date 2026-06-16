"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface Photo {
  r2Key: string;
  sortOrder: number;
}

interface ListingGalleryProps {
  photos: Photo[];
  title: string;
}

const CAUSTICS =
  "radial-gradient(120% 80% at 20% 10%, var(--color-aqua-300), transparent 60%)," +
  "radial-gradient(120% 90% at 90% 100%, var(--color-aqua-100), transparent 55%)," +
  "linear-gradient(160deg, var(--color-aqua-500), var(--color-sand-100))";

function PhotoSlot({
  r2Key,
  alt,
  className,
}: {
  r2Key: string | undefined;
  alt: string;
  className?: string;
}) {
  const bg =
    r2Key?.startsWith("https://")
      ? `url("${r2Key}")`
      : CAUSTICS;
  return (
    <div
      role="img"
      aria-label={alt}
      className={`bg-cover bg-center ${className ?? ""}`}
      style={{ backgroundImage: bg }}
    />
  );
}

export function ListingGallery({ photos, title }: ListingGalleryProps) {
  const t = useTranslations("ListingDetail");
  const [mobileIdx, setMobileIdx] = useState(0);

  const sorted = [...photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const total = sorted.length;

  if (total === 0) {
    return (
      <div
        className="flex h-48 items-center justify-center rounded-card md:h-64"
        style={{ backgroundImage: CAUSTICS }}
      >
        <span className="text-4xl opacity-40">🏠</span>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile: swipe carousel (CSS scroll-snap) */}
      <div className="relative md:hidden">
        <div className="flex snap-x snap-mandatory overflow-x-auto">
          {sorted.map((p, i) => (
            <div
              key={p.r2Key}
              className="w-full shrink-0 snap-start"
              onScroll={() => setMobileIdx(i)}
            >
              <PhotoSlot
                r2Key={p.r2Key}
                alt={`${title} รูปที่ ${i + 1}`}
                className="aspect-[4/3] w-full"
              />
            </div>
          ))}
        </div>
        {total > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1">
            {sorted.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === mobileIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: 1 large + up to 4 grid */}
      <div className="hidden md:grid md:grid-cols-[2fr_1fr] md:grid-rows-2 md:gap-2 md:overflow-hidden md:rounded-card">
        <PhotoSlot
          r2Key={sorted[0]?.r2Key}
          alt={title}
          className="row-span-2 aspect-auto min-h-[340px]"
        />
        {[1, 2, 3, 4].map((i) => (
          <PhotoSlot
            key={i}
            r2Key={sorted[i]?.r2Key}
            alt={`${title} รูปที่ ${i + 1}`}
            className="aspect-[4/3]"
          />
        ))}
      </div>

      {total > 5 && (
        <button
          type="button"
          className="mt-2 hidden text-sm font-semibold text-teal-600 underline md:block"
        >
          {t("gallery", { count: total })}
        </button>
      )}
    </div>
  );
}
