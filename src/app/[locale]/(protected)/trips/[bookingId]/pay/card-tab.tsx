"use client";

import { useState } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";

import { payWithCard } from "./actions";

// Minimal shape of the global injected by omise.js.
interface OmiseGlobal {
  setPublicKey(key: string): void;
  createToken(
    kind: "card",
    data: { name: string; number: string; expiration_month: number; expiration_year: number; security_code: string },
    cb: (status: number, response: { id?: string; message?: string }) => void,
  ): void;
}
declare global {
  interface Window {
    Omise?: OmiseGlobal;
  }
}

export function CardTab({ bookingId, publicKey }: { bookingId: string; publicKey: string }) {
  const t = useTranslations("Booking");
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function tokenize(): Promise<string> {
    return new Promise((resolve, reject) => {
      const omise = window.Omise;
      if (!omise) return reject(new Error("omise.js not loaded"));
      omise.setPublicKey(publicKey);
      const [mm, yy] = exp.split("/");
      omise.createToken(
        "card",
        {
          name,
          number: number.replace(/\s/g, ""),
          expiration_month: Number(mm),
          expiration_year: 2000 + Number(yy),
          security_code: cvc,
        },
        (status, res) => (status === 200 && res.id ? resolve(res.id) : reject(new Error(res.message ?? "tokenize failed"))),
      );
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const token = await tokenize();
      const returnUri = `${window.location.origin}${window.location.pathname}`;
      const res = await payWithCard(bookingId, token, returnUri);
      if (!res.ok) setError(t(res.error));
      else if (res.authorizeUri) window.location.href = res.authorizeUri; // 3DS — poller resumes on return
      // non-3DS success: the poller advances on the webhook confirm
    } catch {
      setError(t("errorPaymentFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Script src="https://cdn.omise.co/omise.js" strategy="afterInteractive" />
      <input
        className="rounded-card border border-line px-3 py-2 text-sm"
        placeholder={t("payCardNumber")}
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        inputMode="numeric"
      />
      <div className="flex gap-2">
        <input
          className="w-1/2 rounded-card border border-line px-3 py-2 text-sm"
          placeholder={t("payCardExpiry")}
          value={exp}
          onChange={(e) => setExp(e.target.value)}
        />
        <input
          className="w-1/2 rounded-card border border-line px-3 py-2 text-sm"
          placeholder={t("payCardCvc")}
          value={cvc}
          onChange={(e) => setCvc(e.target.value)}
          inputMode="numeric"
        />
      </div>
      <input
        className="rounded-card border border-line px-3 py-2 text-sm"
        placeholder={t("payCardName")}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <p className="text-sm text-coral-600">{error}</p>}
      <Button variant="primary" disabled={busy} onClick={() => void submit()}>
        {busy ? t("payProcessing") : t("payCardSubmit")}
      </Button>
    </div>
  );
}
