"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useRouter } from "@/i18n/navigation";

import { sendMessageAction } from "./actions";

export function MessageComposer({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Thread");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await sendMessageAction(bookingId, body);
      if (res.ok) {
        setBody("");
        router.refresh();
      } else {
        setError(t(res.error));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        label=""
        aria-label={t("composerPlaceholder")}
        rows={2}
        placeholder={t("composerPlaceholder")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && <p className="text-sm text-coral-600">{error}</p>}
      <Button variant="primary" disabled={pending || !body.trim()} onClick={send}>
        {t("send")}
      </Button>
    </div>
  );
}
