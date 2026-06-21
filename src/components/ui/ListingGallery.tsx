"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Grip } from "lucide-react";

import { PhotoLightbox } from "./PhotoLightbox";

interface Photo {
  r2Key: string;
  sortOrder: number;
}

interface ListingGalleryProps {
  photos: Photo[];
  title: string;
}

// Calm neutral-grey stand-in until a real photo exists (never a colored smear).
const PLACEHOLDER =
  "linear-gradient(150deg, var(--color-surface-100) 0%, var(--color-surface-50) 100%)";

function PhotoSlot({
  r2Key,
  alt,
  className,
}: {
  r2Key: string | undefined;
  alt: string;
  className?: string;
}) {
  const bg = r2Key?.startsWith("https://") ? `url("${r2Key}")` : PLACEHOLDER;
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
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });

  const sorted = useMemo(
    () => [...photos].sort((a, b) => a.sortOrder - b.sortOrder),
    [photos],
  );
  const total = sorted.length;

  // Only real (uploaded) photos can open in the lightbox.
  const lightboxPhotos = useMemo(
    () =>
      sorted
        .filter((p) => p.r2Key.startsWith("https://"))
        .map((p, i) => ({ url: p.r2Key, alt: `${title} ${i + 1}` })),
    [sorted, title],
  );
  const canOpen = lightboxPhotos.length > 0;
  const openAt = (index: number) => canOpen && setLightbox({ open: true, index });

  if (total === 0) {
    return (
      <div
        className="flex h-48 items-center justify-center rounded-card md:h-64"
        style={{ backgroundImage: PLACEHOLDER }}
      >
        <span className="text-4xl opacity-40">🏠</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Mobile: swipe carousel (CSS scroll-snap) */}
      <div className="relative md:hidden">
        <div className="flex snap-x snap-mandatory overflow-x-auto">
          {sorted.map((p, i) => (
            <button
              key={p.r2Key}
              type="button"
              onClick={() => openAt(i)}
              className="w-full shrink-0 snap-start"
              onScroll={() => setMobileIdx(i)}
            >
              <PhotoSlot
                r2Key={p.r2Key}
                alt={`${title} ${i + 1}`}
                className="aspect-[4/3] w-full"
              />
            </button>
          ))}
        </div>
        {total > 1 ? (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1">
            {sorted.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === mobileIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Desktop: 1 large + up to 4 grid */}
      <div className="hidden md:grid md:grid-cols-[2fr_1fr] md:grid-rows-2 md:gap-2 md:overflow-hidden md:rounded-card">
        <button type="button" onClick={() => openAt(0)} className="row-span-2">
          <PhotoSlot
            r2Key={sorted[0]?.r2Key}
            alt={title}
            className="h-full min-h-[340px] w-full"
          />
        </button>
        {[1, 2, 3, 4].map((i) => (
          <button key={i} type="button" onClick={() => openAt(i)}>
            <PhotoSlot
              r2Key={sorted[i]?.r2Key}
              alt={`${title} ${i + 1}`}
              className="aspect-[4/3] w-full"
            />
          </button>
        ))}
      </div>

      {canOpen ? (
        <button
          type="button"
          onClick={() => openAt(0)}
          className="absolute bottom-4 right-4 hidden items-center gap-2 rounded-pill border border-ink-900 bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-card transition hover:bg-surface-50 md:inline-flex"
        >
          <Grip size={14} />
          {t("gallery", { count: total })}
        </button>
      ) : null}

      <PhotoLightbox
        open={lightbox.open}
        onClose={() => setLightbox((s) => ({ ...s, open: false }))}
        photos={lightboxPhotos}
        startIndex={lightbox.index}
        closeLabel={t("galleryClose")}
        prevLabel={t("galleryPrev")}
        nextLabel={t("galleryNext")}
      />
    </div>
  );
}
