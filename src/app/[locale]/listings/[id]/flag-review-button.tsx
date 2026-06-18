"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { flagReviewAction } from "./actions";

/** Per-review "report" control (§5.5) — reveals a reason field, then files a flag. */
export function FlagReviewButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations("Reviews");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) return <span className="text-xs text-ink-900/40">{t("flagged")}</span>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-ink-900/40 underline hover:text-ink-700"
      >
        {t("flag")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("flagReason")}
        rows={2}
        className="rounded-input border border-line px-2 py-1 text-sm text-ink-900"
      />
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="text-xs text-ink-900/50 underline"
        >
          {t("flagCancel")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await flagReviewAction(reviewId, reason);
              setDone(true);
            })
          }
          className="text-xs font-semibold text-coral-600 underline disabled:opacity-50"
        >
          {t("flagSubmit")}
        </button>
      </div>
    </div>
  );
}
