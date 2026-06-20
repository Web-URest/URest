"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  ESSENTIAL_GROUPS,
  TOGGLEABLE_GROUPS,
  type NotifGroup,
  type NotifPrefs,
} from "@/lib/notifications/prefs";

import { saveNotifPrefsAction } from "./actions";

type Matrix = Record<NotifGroup, { email: boolean; line: boolean }>;

function buildMatrix(initial: NotifPrefs): Matrix {
  const m = {} as Matrix;
  for (const g of TOGGLEABLE_GROUPS) {
    const stored = initial[g];
    m[g] = { email: stored?.email !== false, line: stored?.line !== false };
  }
  return m;
}

export function NotificationPrefs({
  initialPrefs,
  hasLine,
}: {
  initialPrefs: NotifPrefs;
  hasLine: boolean;
}) {
  const t = useTranslations("Profile");
  const [matrix, setMatrix] = useState<Matrix>(() => buildMatrix(initialPrefs));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  function setCell(group: NotifGroup, channel: "email" | "line", value: boolean) {
    setSaved(false);
    setMatrix((m) => ({ ...m, [group]: { ...m[group], [channel]: value } }));
  }

  function save() {
    setError(false);
    startTransition(async () => {
      const res = await saveNotifPrefsAction(matrix);
      if (res.ok) setSaved(true);
      else setError(true);
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-6 shadow-card">
      <h2 className="font-display text-xl text-ink-900">{t("notifications")}</h2>
      <p className="mt-1 text-sm text-ink-700">{t("notificationsDesc")}</p>

      {!hasLine && (
        <p className="mt-3 rounded-lg bg-sand-100 px-3 py-2 text-sm text-ink-700">
          {t("connectLine")}
        </p>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <thead>
            <tr className="text-ink-700">
              <th className="pb-2 text-left font-medium" />
              <th className="pb-2 px-3 text-center font-medium">{t("channelEmail")}</th>
              <th className="pb-2 px-3 text-center font-medium">{t("channelLine")}</th>
            </tr>
          </thead>
          <tbody>
            {TOGGLEABLE_GROUPS.map((group) => {
              const essential = ESSENTIAL_GROUPS.has(group);
              return (
                <tr key={group} className="border-t border-line">
                  <td className="py-3 pr-3 text-ink-900">
                    {t(`group${group}`)}
                    {essential && (
                      <span className="ml-2 text-xs text-ink-700">({t("essentialNote")})</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-aqua-500"
                      checked={essential ? true : matrix[group].email}
                      disabled={essential || pending}
                      aria-label={`${t(`group${group}`)} — ${t("channelEmail")}`}
                      onChange={(e) => setCell(group, "email", e.target.checked)}
                    />
                  </td>
                  <td className="py-3 px-3 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-aqua-500"
                      checked={hasLine && matrix[group].line}
                      disabled={!hasLine || pending}
                      aria-label={`${t(`group${group}`)} — ${t("channelLine")}`}
                      onChange={(e) => setCell(group, "line", e.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {t("save")}
        </Button>
        {saved && <span className="text-sm text-jade-500">{t("saved")}</span>}
        {error && <span className="text-sm text-coral-600">{t("errorGeneric")}</span>}
      </div>
    </section>
  );
}
