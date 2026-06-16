"use client";

import { useRef, useTransition } from "react";

import { Button } from "@/components/ui/Button";

import { addPhotoAction, removePhotoAction, setCoverAction } from "../actions";

export interface WizardPhoto {
  id: string;
  r2Key: string;
  url: string;
  isCover: boolean;
  sortOrder: number;
}

type T = (key: string, values?: Record<string, string | number>) => string;

/**
 * Wizard step ② — photos (PRODUCT_FLOWS §4.1 ②: min 5, pick a cover).
 * Uploads persist immediately via the (stubbed, #11) upload action so the
 * min-5/cover logic works end-to-end before R2 is wired.
 */
export function Step2Photos({
  listingId,
  photos,
  setPhotos,
  t,
}: {
  listingId: string | null;
  photos: WizardPhoto[];
  setPhotos: (next: WizardPhoto[]) => void;
  t: T;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  if (!listingId) {
    return <p className="text-ink-700">{t("errorIncomplete")}</p>;
  }

  function onFiles(files: FileList | null) {
    if (!files || !listingId) return;
    const list = Array.from(files);
    startTransition(async () => {
      const added: WizardPhoto[] = [];
      for (const f of list) {
        const res = await addPhotoAction(listingId, {
          fileName: f.name,
          byteLength: f.size,
          contentType: f.type,
        });
        if (!res.ok) continue;
        try {
          const put = await fetch(res.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": f.type },
            body: f,
          });
          if (!put.ok) throw new Error("upload failed");
          added.push(res.photo);
        } catch {
          // Upload didn't land — drop the row we just created (no orphan).
          await removePhotoAction(listingId, res.photo.id);
        }
      }
      if (added.length) setPhotos([...photos, ...added]);
    });
  }

  function remove(id: string) {
    if (!listingId) return;
    startTransition(async () => {
      const res = await removePhotoAction(listingId, id);
      if (res.ok) {
        const next = photos.filter((p) => p.id !== id);
        // If we removed the cover, the server promoted the first remaining one.
        if (!next.some((p) => p.isCover) && next[0]) next[0].isCover = true;
        setPhotos([...next]);
      }
    });
  }

  function setCover(id: string) {
    if (!listingId) return;
    startTransition(async () => {
      const res = await setCoverAction(listingId, id);
      if (res.ok) {
        setPhotos(photos.map((p) => ({ ...p, isCover: p.id === id })));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-900">{t("photosLabel")}</span>
        <span className="text-sm text-ink-700">
          {t("photosCount", { count: photos.length })}
        </span>
      </div>
      <p className="text-sm text-ink-700">{t("photosHint")}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <div
            key={p.id}
            className="relative flex aspect-[3/2] flex-col justify-end overflow-hidden rounded-photo border border-line bg-sand-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            {p.isCover && (
              <span className="absolute left-2 top-2 z-10 rounded-full bg-jade-500 px-2 py-0.5 text-xs text-white">
                {t("coverBadge")}
              </span>
            )}
            <div className="relative z-10 flex gap-3 bg-ink-900/50 px-2 py-1 text-white">
              {!p.isCover && (
                <button
                  type="button"
                  onClick={() => setCover(p.id)}
                  disabled={pending}
                  className="text-xs underline"
                >
                  {t("setCover")}
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={pending}
                className="text-xs underline"
              >
                {t("removePhoto")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <div>
        <Button
          variant="ghost"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
        >
          {t("addPhoto")}
        </Button>
      </div>
    </div>
  );
}
