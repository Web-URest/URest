"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { ConciergeCard } from "@/lib/concierge/cards";
import { EscrowStrip } from "@/components/ui/EscrowStrip";

type DraftCard = Extract<ConciergeCard, { kind: "booking_draft" }>;

/**
 * The in-chat booking confirmation card (#32). Tapping ยืนยัน calls the confirm
 * endpoint (which mints the server-side token), then asks the parent to re-invoke
 * the chat so the model submits this draft. The card never sees a token.
 */
export function BookingDraftCard({
  card,
  onConfirm,
}: {
  card: DraftCard;
  onConfirm: (draftId: string) => void;
}) {
  const t = useTranslations("Concierge");
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/concierge/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId: card.draftId }),
        });
        const data = (await res.json()) as { ok: boolean; reason?: string };
        if (res.ok && data.ok) {
          setConfirmed(true);
          onConfirm(card.draftId);
        } else {
          setError(data.reason === "PHONE_UNVERIFIED" ? t("cardPhoneNeeded") : t("cardConfirmError"));
        }
      } catch {
        setError(t("cardConfirmError"));
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-white p-4 shadow-card">
      <p className="font-display font-semibold text-ink-900">{card.title}</p>
      <p className="mt-0.5 text-sm text-ink-500">
        {card.checkIn} – {card.checkOut} · {t("cardGuests", { count: card.guests })} ·{" "}
        {t("cardNights", { count: card.nights })}
      </p>

      <dl className="mt-3 flex flex-col gap-0.5 text-sm">
        {card.priceLines.map((p) => (
          <div key={p.date} className="flex justify-between">
            <dt className="text-ink-500">
              {p.date}
              {p.season ? ` · ${p.season}` : ""}
            </dt>
            <dd className="tabular-nums text-ink-700">฿{p.priceThb.toLocaleString()}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-2 flex items-baseline justify-between border-t border-border-subtle pt-2 text-ink-900">
        <span className="text-sm font-semibold">{t("cardTotal")}</span>
        <span className="font-display text-lg font-bold tabular-nums">
          ฿{card.totalThb.toLocaleString()}
        </span>
      </div>

      <p className="mt-3 text-center text-xs text-ink-500">{t("cardAiCannotBook")}</p>

      {error && <p className="mt-2 text-xs text-error-600">{error}</p>}

      <button
        type="button"
        disabled={pending || confirmed}
        onClick={confirm}
        className={`mt-2 w-full rounded-pill px-4 py-2.5 text-sm font-semibold text-white transition duration-150 ease-out disabled:opacity-50 ${
          confirmed ? "bg-trust-500" : "bg-brand-500 hover:bg-brand-600"
        }`}
      >
        {confirmed ? t("cardConfirmed") : pending ? t("cardConfirming") : t("cardConfirm")}
      </button>

      <div className="mt-3">
        <EscrowStrip variant="compact" step={1} audience="guest" />
      </div>
    </div>
  );
}
