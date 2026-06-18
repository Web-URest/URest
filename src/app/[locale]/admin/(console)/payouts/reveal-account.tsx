"use client";

import { useState, useTransition } from "react";

import { revealAccountAction } from "./actions";

/**
 * On-demand reveal of a host's bank account number (§5.2). The number is NOT in
 * the server-rendered HTML — it's fetched only on click, and that click is
 * audited server-side (lib/admin/payout.revealAccountNumber). Shown transiently;
 * never persisted in the page.
 */
export function RevealAccount({
  payoutAccountId,
  label,
  hint,
}: {
  payoutAccountId: string;
  label: string;
  hint: string;
}) {
  const [pending, start] = useTransition();
  const [accountNumber, setAccountNumber] = useState<string | null>(null);

  if (accountNumber) {
    return <span className="font-mono text-aqua-300">{accountNumber}</span>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      title={hint}
      onClick={() =>
        start(async () => {
          const result = await revealAccountAction(payoutAccountId);
          if (result.ok) setAccountNumber(result.accountNumber);
        })
      }
      className="text-aqua-300 underline underline-offset-2 hover:text-aqua-100 disabled:opacity-50"
    >
      {pending ? "…" : label}
    </button>
  );
}
