"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import { Textarea } from "@/components/ui/Textarea";
import { useRouter } from "@/i18n/navigation";

import { presignReviewPhotoAction, submitReviewAction } from "./actions";

const MAX_PHOTOS = 6;
const SUB_SCORES = ["cleanliness", "accuracyToPhotos", "hostResponsiveness", "valueForMoney"] as const;
type SubScore = (typeof SUB_SCORES)[number];

interface UploadedPhoto {
  r2Key: string;
  previewUrl: string;
}

/**
 * Guest review form (PRODUCT_FLOWS §3.4): overall + 4 sub-scores + optional text
 * + optional photos. Photos presign → direct PUT to R2; the r2Keys go with the
 * submit. On success, returns to the listing so the guest sees the published review.
 */
export function ReviewForm({ bookingId, listingId }: { bookingId: string; listingId: string }) {
  const t = useTranslations("Reviews");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [overall, setOverall] = useState(0);
  const [subs, setSubs] = useState<Record<SubScore, number>>({
    cleanliness: 0,
    accuracyToPhotos: 0,
    hostResponsiveness: 0,
    valueForMoney: 0,
  });
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const complete = overall >= 1 && SUB_SCORES.every((k) => subs[k] >= 1);

  function setSub(key: SubScore, v: number) {
    setSubs((prev) => ({ ...prev, [key]: v }));
  }

  function onFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, room);
    startTransition(async () => {
      const added: UploadedPhoto[] = [];
      for (const f of list) {
        const res = await presignReviewPhotoAction(bookingId, { byteLength: f.size, contentType: f.type });
        if (!res.ok) continue;
        try {
          const put = await fetch(res.uploadUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
          if (!put.ok) throw new Error("upload failed");
          added.push({ r2Key: res.r2Key, previewUrl: URL.createObjectURL(f) });
        } catch {
          // dropped — the key was never persisted to a review, so no orphan row
        }
      }
      if (added.length) setPhotos((prev) => [...prev, ...added]);
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitReviewAction({
        bookingId,
        overall,
        cleanliness: subs.cleanliness,
        accuracyToPhotos: subs.accuracyToPhotos,
        hostResponsiveness: subs.hostResponsiveness,
        valueForMoney: subs.valueForMoney,
        text: text.trim() || undefined,
        photoKeys: photos.map((p) => p.r2Key),
      });
      if (res.ok) {
        router.push(`/listings/${listingId}`);
        router.refresh();
      } else {
        setError(t("errorGeneric"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink-900">{t("overall")}</span>
        <StarRatingInput value={overall} onChange={setOverall} label={t("overall")} disabled={pending} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SUB_SCORES.map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <span className="text-sm text-ink-900/80">{t(key)}</span>
            <StarRatingInput value={subs[key]} onChange={(v) => setSub(key, v)} label={t(key)} disabled={pending} />
          </div>
        ))}
      </div>

      <Textarea
        id="review-text"
        label={t("textLabel")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("textPlaceholder")}
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

      <Button variant="primary" onClick={submit} disabled={!complete || pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </div>
  );
}
