"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

interface FaqSectionProps {
  entries: FaqEntry[];
}

export function FaqSection({ entries }: FaqSectionProps) {
  const t = useTranslations("ListingDetail");
  const [open, setOpen] = useState<string | null>(null);

  if (entries.length === 0) return null;

  return (
    <section aria-label={t("sectionFaq")}>
      <h2 className="mb-4 font-display text-xl text-ink-900">{t("sectionFaq")}</h2>
      <div className="divide-y divide-line rounded-card border border-line bg-white">
        {entries.map((e) => (
          <div key={e.id}>
            <button
              type="button"
              onClick={() => setOpen(open === e.id ? null : e.id)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              aria-expanded={open === e.id}
            >
              <span className="font-semibold text-ink-900">{e.question}</span>
              <span
                aria-hidden
                className={`shrink-0 text-lg text-aqua-500 transition-transform ${open === e.id ? "rotate-45" : ""}`}
              >
                +
              </span>
            </button>
            {open === e.id && (
              <p className="px-5 pb-4 text-sm leading-relaxed text-ink-700">{e.answer}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
