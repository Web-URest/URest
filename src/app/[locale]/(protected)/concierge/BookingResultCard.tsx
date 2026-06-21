"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { StatusPill } from "@/components/ui/StatusPill";
import type { ConciergeCard } from "@/lib/concierge/cards";

type ResultCard = Extract<ConciergeCard, { kind: "payment_qr" | "request_sent" }>;

/**
 * Server-attached result card after a concierge submit (#32). Instant-book →
 * the PromptPay QR in-chat ("คุณแค่สแกนจ่าย"); request-book → a "sent, awaiting
 * host" card linking to the trip. The QR url is server-supplied, never from the model.
 */
export function BookingResultCard({ card }: { card: ResultCard }) {
  const t = useTranslations("Concierge");

  if (card.kind === "payment_qr") {
    return (
      <div className="rounded-2xl border border-border-subtle bg-white p-4 text-center shadow-card">
        <p className="font-display font-semibold text-ink-900">{t("cardPayTitle")}</p>
        {card.code && <p className="mt-0.5 text-sm text-ink-500">{card.code}</p>}
        {card.qrUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.qrUrl}
            alt="PromptPay QR"
            className="mx-auto my-3 h-52 w-52 rounded-photo border border-border-subtle"
          />
        )}
        <Link
          href={card.payUrl}
          className="text-sm font-semibold text-brand-700 underline underline-offset-4"
        >
          {t("cardPayLink")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display font-semibold text-trust-600">
          ✓ {t("cardRequestSent")}
        </p>
        <StatusPill status="REQUESTED" />
      </div>
      {card.code && <p className="mt-0.5 text-sm text-ink-500">{card.code}</p>}
      <Link
        href={card.tripUrl}
        className="mt-1 inline-block text-sm font-semibold text-brand-700 underline underline-offset-4"
      >
        {t("cardViewTrip")}
      </Link>
    </div>
  );
}
