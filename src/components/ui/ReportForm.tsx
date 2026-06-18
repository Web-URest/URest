"use client";

import { useTranslations } from "next-intl";

/**
 * ReportForm — shared report intake (§3.8/§4.5). Category radios + free text,
 * posting to a bound server action (the caller binds the target id). Rendered
 * inside a native <details> disclosure at each entry point (no modal infra).
 */
export const REPORT_CATEGORIES = [
  "DOESNT_MATCH_LISTING",
  "CLEANLINESS",
  "SAFETY",
  "HOST_BEHAVIOR",
  "SUSPECTED_FRAUD",
  "OTHER",
] as const;

export function ReportForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const t = useTranslations("Reports");

  return (
    <form action={action} className="mt-3 flex flex-col gap-3 rounded-card bg-white p-4 shadow-card">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink-900">{t("categoryLabel")}</legend>
        {REPORT_CATEGORIES.map((c, i) => (
          <label key={c} className="flex items-center gap-2 text-sm text-ink-700">
            <input type="radio" name="category" value={c} defaultChecked={i === 0} required />
            {t(`categories.${c}`)}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-900">
        {t("detailLabel")}
        <textarea
          name="text"
          required
          rows={3}
          placeholder={t("detailPlaceholder")}
          className="rounded-input border border-sand-300 px-3 py-2 text-sm text-ink-900"
        />
      </label>
      <button
        type="submit"
        className="w-fit rounded-full bg-aqua-500 px-5 py-2 text-sm font-medium text-white hover:bg-aqua-600"
      >
        {t("submit")}
      </button>
    </form>
  );
}
