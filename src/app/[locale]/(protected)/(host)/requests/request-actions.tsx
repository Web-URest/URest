"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { useRouter } from "@/i18n/navigation";

import { acceptRequest, declineRequest, type ActionResult } from "./actions";

export function RequestActions({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Host.requests");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: (id: string) => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await action(bookingId);
      if (res.ok) router.refresh();
      else setError(t("actionError"));
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button variant="primary" disabled={pending} onClick={() => run(acceptRequest)}>
          {t("accept")}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => run(declineRequest)}>
          {t("decline")}
        </Button>
      </div>
      {error && <p className="text-sm text-coral-600">{error}</p>}
    </div>
  );
}
