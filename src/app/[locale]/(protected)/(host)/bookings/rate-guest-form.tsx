"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { StarRatingInput } from "@/components/ui/StarRatingInput";
import { TextInput } from "@/components/ui/TextInput";
import { useRouter } from "@/i18n/navigation";

import { rateGuestAction } from "./actions";

/** Host → guest 1–5 rating for a completed stay (§3.4). Shown only to future hosts. */
export function RateGuestForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Host.bookings");
  const router = useRouter();
  const [score, setScore] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await rateGuestAction(bookingId, score, reason.trim() || undefined);
      if (res.ok) router.refresh();
      else setError(t("rateError"));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-ink-900/80">{t("rateGuest")}</span>
      <StarRatingInput value={score} onChange={setScore} label={t("rateGuest")} disabled={pending} />
      <TextInput
        id={`rate-${bookingId}`}
        label={t("rateReasonLabel")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("rateReasonPlaceholder")}
      />
      {error && <p className="text-sm text-coral-600">{error}</p>}
      <div>
        <Button variant="ghost" onClick={submit} disabled={score < 1 || pending}>
          {t("rateSubmit")}
        </Button>
      </div>
    </div>
  );
}
