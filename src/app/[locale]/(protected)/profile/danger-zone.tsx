"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";

import { deleteAccountAction } from "./actions";

export function DangerZone() {
  const t = useTranslations("Profile");
  const [confirming, setConfirming] = useState(false);
  const [ack, setAck] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function runDelete() {
    setError(false);
    startTransition(async () => {
      // On success the action redirects (signOut); a returned result means it failed.
      const res = await deleteAccountAction();
      if (!res.ok) setError(true);
    });
  }

  return (
    <section className="space-y-6">
      {/* Data export */}
      <div className="rounded-2xl border border-line bg-white p-6 shadow-card">
        <h2 className="font-display text-xl text-ink-900">{t("exportTitle")}</h2>
        <p className="mt-1 text-sm text-ink-700">{t("exportDesc")}</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => {
            // Full navigation to the download endpoint (Content-Disposition) — not a page transition.
            window.location.href = "/api/account/export";
          }}
        >
          {t("exportButton")}
        </Button>
      </div>

      {/* Danger zone — delete */}
      <div className="rounded-2xl border border-coral-100 bg-coral-50 p-6">
        <h2 className="font-display text-xl text-coral-600">{t("dangerTitle")}</h2>
        <p className="mt-1 text-sm text-ink-700">{t("dangerDesc")}</p>

        {!confirming ? (
          <Button variant="ghost" className="mt-4 text-coral-600" onClick={() => setConfirming(true)}>
            {t("deleteButton")}
          </Button>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="font-medium text-ink-900">{t("deleteConfirmTitle")}</p>
            <label className="flex items-start gap-3 text-sm text-ink-900">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-coral-500"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>{t("deleteConfirmAck")}</span>
            </label>
            <div className="flex items-center gap-3">
              <Button variant="money" disabled={!ack || pending} onClick={runDelete}>
                {t("deleteConfirm")}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setConfirming(false);
                  setAck(false);
                }}
              >
                {t("cancel")}
              </Button>
            </div>
            {error && <p className="text-sm text-coral-600">{t("errorGeneric")}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
