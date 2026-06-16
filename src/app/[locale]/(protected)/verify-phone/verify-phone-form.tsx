"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";

import { confirmCodeAction, sendCodeAction } from "./actions";

type Step = "phone" | "code" | "done";

export function VerifyPhoneForm() {
  const t = useTranslations("Otp");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await sendCodeAction(phone);
      switch (result.status) {
        case "SENT":
          setStep("code");
          setMessage(t("sent", { phone }));
          break;
        case "INVALID_PHONE":
          setError(t("errorInvalidPhone"));
          break;
        case "RATE_LIMITED":
          setError(t("errorRateLimited"));
          break;
      }
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmCodeAction(code);
      switch (result.status) {
        case "VERIFIED":
          setStep("done");
          setMessage(t("verified"));
          break;
        case "INVALID_CODE":
          setError(t("errorInvalidCode", { remaining: result.attemptsRemaining }));
          break;
        case "EXPIRED":
          setError(t("errorExpired"));
          break;
        case "TOO_MANY_ATTEMPTS":
          setError(t("errorTooManyAttempts"));
          break;
        case "NO_ACTIVE_CODE":
          setError(t("errorNoActiveCode"));
          break;
      }
    });
  }

  if (step === "done") {
    return <p className="text-jade-500 font-semibold">{t("verified")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "phone" ? (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-900">{t("phoneLabel")}</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("phonePlaceholder")}
            className="rounded-xl border border-line bg-sand-100 px-4 py-3 text-ink-900 outline-none focus:ring-2 focus:ring-aqua-500"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-900">{t("codeLabel")}</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="rounded-xl border border-line bg-sand-100 px-4 py-3 text-lg tracking-[0.4em] text-ink-900 outline-none focus:ring-2 focus:ring-aqua-500"
          />
        </label>
      )}

      {message && <p className="text-sm text-teal-600">{message}</p>}
      {error && <p className="text-sm text-coral-600">{error}</p>}

      {step === "phone" ? (
        <Button onClick={send} disabled={pending || phone.length === 0} fullWidth>
          {t("sendCode")}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button onClick={confirm} disabled={pending || code.length !== 6} fullWidth>
            {t("confirm")}
          </Button>
          <Button variant="ghost" onClick={send} disabled={pending} fullWidth>
            {t("resend")}
          </Button>
        </div>
      )}

      <p className="text-xs text-ink-900/60">{t("devHint")}</p>
    </div>
  );
}
