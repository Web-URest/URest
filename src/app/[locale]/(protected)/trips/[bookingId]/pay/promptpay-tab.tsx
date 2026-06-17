"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";

import { getPromptPayCharge } from "./actions";

export function PromptPayTab({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Booking");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(regenerate = false) {
    setLoading(true);
    setError(null);
    const res = await getPromptPayCharge(bookingId, { regenerate });
    if (res.ok) setQrUrl(res.qrUrl);
    else setError(t(res.error));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  return (
    <div className="flex flex-col items-center gap-3">
      {loading && <p className="text-sm text-ink-900/60">{t("payProcessing")}</p>}
      {qrUrl && !loading && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="PromptPay QR" className="h-56 w-56 rounded-card border border-line" />
          <p className="text-sm text-ink-900/70">{t("payScanQr")}</p>
        </>
      )}
      {error && <p className="text-sm text-coral-600">{error}</p>}
      <Button variant="ghost" disabled={loading} onClick={() => void load(true)}>
        {t("payQrRegenerate")}
      </Button>
    </div>
  );
}
