"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { CardTab } from "./card-tab";
import { PromptPayTab } from "./promptpay-tab";

export function PaymentTabs({ bookingId, publicKey }: { bookingId: string; publicKey: string }) {
  const t = useTranslations("Booking");
  const [tab, setTab] = useState<"promptpay" | "card">("promptpay");
  return (
    <div className="rounded-card border border-line bg-white p-5 shadow-card">
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("promptpay")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === "promptpay" ? "bg-ink-900 text-sand-50" : "text-ink-900/60"}`}
        >
          {t("payTabPromptpay")}
        </button>
        <button
          onClick={() => setTab("card")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === "card" ? "bg-ink-900 text-sand-50" : "text-ink-900/60"}`}
        >
          {t("payTabCard")}
        </button>
      </div>
      {tab === "promptpay" ? <PromptPayTab bookingId={bookingId} /> : <CardTab bookingId={bookingId} publicKey={publicKey} />}
    </div>
  );
}
