"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { REPORT_CATEGORIES } from "@/components/ui/ReportForm";
import { useRouter } from "@/i18n/navigation";

import { openDisputeAction, presignDisputePhotoAction } from "./actions";

const MAX_PHOTOS = 6;

interface UploadedPhoto {
  r2Key: string;
  previewUrl: string;
}

/**
 * Guest dispute intake (PRODUCT_FLOWS §5.3): a category + detail + optional photos.
 * Submitting opens the dispute (freezing the payout) and records the evidence —
 * the copy makes that consequence explicit. Photos presign → direct PUT to the
 * PRIVATE bucket; the r2Keys ride the submit. On success, returns to the trip.
 */
export function DisputeForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Disputes");
  const cat = useTranslations("Reports.categories");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [category, setCategory] = useState<(typeof REPORT_CATEGORIES)[number]>(REPORT_CATEGORIES[0]);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  function onFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, room);
    startTransition(async () => {
      const added: UploadedPhoto[] = [];
      for (const f of list) {
        const res = await presignDisputePhotoAction(bookingId, { byteLength: f.size, contentType: f.type });
        if (!res.ok) continue;
        try {
          const put = await fetch(res.uploadUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
          if (!put.ok) throw new Error("upload failed");
          added.push({ r2Key: res.r2Key, previewUrl: URL.createObjectURL(f) });
        } catch {
          // dropped — the key was never persisted, so no orphan
        }
      }
      if (added.length) setPhotos((prev) => [...prev, ...added]);
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await openDisputeAction({
        bookingId,
        category,
        text: text.trim(),
        photoKeys: photos.map((p) => p.r2Key),
      });
      if (res.ok) {
        router.push(`/trips/${bookingId}`);
        router.refresh();
      } else {
        setError(t("errorGeneric"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-ink-900/80">
        {t("freezeNotice")}
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink-900">{t("categoryLabel")}</legend>
        {REPORT_CATEGORIES.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="radio"
              name="category"
              value={c}
              checked={category === c}
              onChange={() => setCategory(c)}
            />
            {cat(c)}
          </label>
        ))}
      </fieldset>

      <Textarea
        id="dispute-text"
        label={t("detailLabel")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("detailPlaceholder")}
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm text-ink-900/80">{t("photosLabel")}</span>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p) => (
              <div key={p.r2Key} className="aspect-square overflow-hidden rounded-photo border border-line bg-sand-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        {photos.length < MAX_PHOTOS && (
          <div>
            <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={pending}>
              {t("addPhoto")}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-coral-600">
          {error}
        </p>
      )}

      <Button variant="primary" onClick={submit} disabled={!text.trim() || pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </div>
  );
}
