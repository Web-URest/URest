import { getLocale, getTranslations } from "next-intl/server";

import { getAdmin } from "@/lib/admin/auth";
import { loadPayoutDueList, reconcile, type Reconciliation } from "@/lib/admin/payout";
import { redirect } from "@/i18n/navigation";
import { formatSatang } from "@/lib/money";

import { markPaidAction, placeHoldAction, releaseHoldAction } from "./actions";
import { RevealAccount } from "./reveal-account";

/**
 * Admin payout due list (PRODUCT_FLOWS §5.2, issue #25). RELEASABLE bookings
 * grouped by host account, gated by a live Opn-vs-ledger reconciliation banner:
 * mark-paid is disabled unless reconciliation is OK. Held bookings stay listed
 * (greyed) with their reason. Mirrors the approval-queue page (ink chrome,
 * server-rendered forms, no modal). The account number is revealed on demand by
 * the audited client component — never in this HTML.
 */

const bkk = (d: Date) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }).format(d);

export default async function PayoutsPage() {
  const admin = await getAdmin();
  if (!admin) {
    const locale = await getLocale();
    redirect({ href: "/admin/login", locale });
  }

  const t = await getTranslations("Admin.Payouts");

  // A gateway error must fail closed: treat an unreachable Opn as "blocked".
  let recon: Reconciliation | null = null;
  try {
    recon = await reconcile();
  } catch {
    recon = null;
  }
  const canPay = recon?.ok ?? false;

  const groups = await loadPayoutDueList();

  return (
    <section>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-ink-700">{t("subtitle")}</p>

      {recon === null ? (
        <div className="mt-4 rounded bg-coral-100 px-4 py-3 text-sm text-coral-600">{t("reconcileError")}</div>
      ) : recon.ok ? (
        <div className="mt-4 rounded bg-jade-100 px-4 py-3 text-sm text-jade-500">
          {t("reconcileOk", {
            balance: formatSatang(recon.opnTotalSatang),
            obligation: formatSatang(recon.obligationSatang),
          })}
        </div>
      ) : (
        <div className="mt-4 rounded bg-coral-100 px-4 py-3 text-sm text-coral-600">
          {t("reconcileBlocked", {
            balance: formatSatang(recon.opnTotalSatang),
            obligation: formatSatang(recon.obligationSatang),
          })}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="mt-8 text-ink-700">{t("empty")}</p>
      ) : (
        groups.map((group) => {
          const hostHold = group.bookings.find((b) => b.hold?.scope === "host")?.hold ?? null;
          return (
            <div key={group.hostId} className="mt-6 rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-ink-900">{group.hostName}</h2>
                  {group.payoutAccount ? (
                    <p className="mt-1 text-sm text-ink-700">
                      {t("account")}: {group.payoutAccount.bankCode} · {group.payoutAccount.accountName} ·{" "}
                      <RevealAccount
                        payoutAccountId={group.payoutAccount.id}
                        label={t("revealAccount")}
                        hint={t("revealHint")}
                      />
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-coral-500">{t("noAccount")}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-medium text-ink-900">
                  {t("groupTotal", { amount: formatSatang(group.totalSatang) })}
                </span>
              </div>

              {hostHold ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded bg-gold-100 px-3 py-2 text-sm text-gold-800">
                  <span>
                    {t("heldHostBadge")} — {hostHold.reason}
                  </span>
                  <form action={releaseHoldAction}>
                    <input type="hidden" name="holdId" value={hostHold.id} />
                    <button type="submit" title={t("releaseConfirm")} className="font-medium underline">
                      {t("release")}
                    </button>
                  </form>
                </div>
              ) : (
                <form action={placeHoldAction} className="mt-3 flex gap-2">
                  <input type="hidden" name="hostUserId" value={group.hostId} />
                  <input
                    name="reason"
                    required
                    placeholder={t("holdHostReasonPlaceholder")}
                    className="flex-1 rounded border border-border bg-white px-2 py-1 text-sm text-ink-900 placeholder:text-ink-700"
                  />
                  <button
                    type="submit"
                    className="rounded border border-border px-3 py-1 text-sm text-ink-700 hover:bg-surface-50"
                  >
                    {t("holdHostTitle")}
                  </button>
                </form>
              )}

              <table className="mt-4 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-700">
                    <th className="py-2 pr-4">{t("colBooking")}</th>
                    <th className="py-2 pr-4">{t("colCheckout")}</th>
                    <th className="py-2 pr-4">{t("colAmount")}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {group.bookings.map((b) => (
                    <tr key={b.id} className="border-b border-border/50">
                      <td className="py-3 pr-4 text-ink-900">{b.code ?? b.id}</td>
                      <td className="py-3 pr-4 text-ink-700">{bkk(b.checkOut)}</td>
                      <td className="py-3 pr-4 tabular-nums text-ink-900">{formatSatang(b.hostAmountSatang)}</td>
                      <td className="py-3">
                        {b.hold ? (
                          b.hold.scope === "booking" ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-800">
                                {t("heldBadge")}
                              </span>
                              <span className="text-xs text-ink-700">{b.hold.reason}</span>
                              <form action={releaseHoldAction}>
                                <input type="hidden" name="holdId" value={b.hold.id} />
                                <button type="submit" title={t("releaseConfirm")} className="text-xs text-aqua-300 underline">
                                  {t("release")}
                                </button>
                              </form>
                            </div>
                          ) : (
                            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-800">
                              {t("heldHostBadge")}
                            </span>
                          )
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <form action={markPaidAction} className="flex items-center gap-2">
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input
                                name="slipRef"
                                required
                                placeholder={t("slipRefPlaceholder")}
                                className="w-44 rounded border border-border bg-white px-2 py-1 text-xs text-ink-900 placeholder:text-ink-700"
                              />
                              <button
                                type="submit"
                                disabled={!canPay || !group.payoutAccount}
                                title={t("markPaidConfirm")}
                                className="rounded bg-coral-500 px-3 py-1 text-xs font-medium text-white hover:bg-coral-600 disabled:opacity-40"
                              >
                                {t("markPaid")}
                              </button>
                            </form>
                            <form action={placeHoldAction} className="flex items-center gap-2">
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input
                                name="reason"
                                required
                                placeholder={t("holdReasonPlaceholder")}
                                className="w-36 rounded border border-border bg-white px-2 py-1 text-xs text-ink-900 placeholder:text-ink-700"
                              />
                              <button
                                type="submit"
                                className="rounded border border-border px-3 py-1 text-xs text-ink-700 hover:bg-surface-50"
                              >
                                {t("placeHold")}
                              </button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </section>
  );
}
