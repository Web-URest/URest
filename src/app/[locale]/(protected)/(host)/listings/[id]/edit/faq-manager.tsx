"use client";

import { FaqSource, FaqStatus } from "@prisma/client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/FieldError";
import { TextInput } from "@/components/ui/TextInput";
import { Textarea } from "@/components/ui/Textarea";

import {
  createFaqAction,
  deleteFaqAction,
  toggleFaqStatusAction,
  updateFaqAction,
  type FaqRow,
} from "./actions";

/**
 * FAQ CRUD for the Edit Villa page (PRODUCT_FLOWS §4.1 FAQ, §4.4). Entries feed
 * น้องเรสต์ via get_listing_details; admin-suggested entries arrive as DRAFT and
 * the host publishes them. Local state keeps other edit-page cards intact (no full
 * page refresh on a FAQ change).
 */
export function FaqManager({
  listingId,
  initial,
}: {
  listingId: string;
  initial: FaqRow[];
}) {
  const t = useTranslations("Host");
  const [entries, setEntries] = useState<FaqRow[]>(initial);
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await createFaqAction(listingId, { question: newQ, answer: newA });
      if (res.ok) {
        setEntries((e) => [...e, res.entry]);
        setNewQ("");
        setNewA("");
      } else setError(res.error);
    });
  }

  function patchEntry(id: string, p: Partial<FaqRow>) {
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }

  function save(entry: FaqRow) {
    setError(null);
    startTransition(async () => {
      const res = await updateFaqAction(entry.id, {
        question: entry.question,
        answer: entry.answer,
      });
      if (!res.ok) setError(res.error);
    });
  }

  function toggle(entry: FaqRow) {
    const next =
      entry.status === FaqStatus.PUBLISHED ? FaqStatus.DRAFT : FaqStatus.PUBLISHED;
    startTransition(async () => {
      const res = await toggleFaqStatusAction(entry.id, next);
      if (res.ok) patchEntry(entry.id, { status: next });
      else setError(res.error);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteFaqAction(id);
      if (res.ok) setEntries((e) => e.filter((x) => x.id !== id));
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-700">{t("faqIntro")}</p>

      {entries.length === 0 && <p className="text-sm text-ink-700">{t("faqEmpty")}</p>}

      {entries.map((e) => (
        <div key={e.id} className="flex flex-col gap-3 rounded-input border border-line p-3">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                e.status === FaqStatus.PUBLISHED
                  ? "bg-jade-100 text-jade-500"
                  : "bg-sand-300 text-ink-900/60"
              }`}
            >
              {e.status === FaqStatus.PUBLISHED ? t("faqStatusPublished") : t("faqStatusDraft")}
            </span>
            {e.source === FaqSource.ADMIN_SUGGESTED && (
              <span className="rounded-full bg-gold-100 px-2 py-0.5 font-semibold text-gold-800">
                {t("faqSourceAdmin")}
              </span>
            )}
          </div>
          <TextInput
            id={`faq-q-${e.id}`}
            label={t("faqQuestion")}
            value={e.question}
            onChange={(ev) => patchEntry(e.id, { question: ev.target.value })}
          />
          <Textarea
            id={`faq-a-${e.id}`}
            label={t("faqAnswer")}
            value={e.answer}
            onChange={(ev) => patchEntry(e.id, { answer: ev.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => save(e)} disabled={pending}>
              {t("save")}
            </Button>
            <Button variant="ghost" onClick={() => toggle(e)} disabled={pending}>
              {e.status === FaqStatus.PUBLISHED ? t("faqUnpublish") : t("faqPublish")}
            </Button>
            <button
              type="button"
              onClick={() => remove(e.id)}
              disabled={pending}
              className="text-sm text-coral-600 underline disabled:opacity-50"
            >
              {t("faqDelete")}
            </button>
          </div>
        </div>
      ))}

      {/* Add new */}
      <div className="flex flex-col gap-3 rounded-input border border-dashed border-line p-3">
        <TextInput
          id="faq-new-q"
          label={t("faqQuestion")}
          value={newQ}
          onChange={(e) => setNewQ(e.target.value)}
        />
        <Textarea
          id="faq-new-a"
          label={t("faqAnswer")}
          value={newA}
          onChange={(e) => setNewA(e.target.value)}
        />
        <div>
          <Button
            variant="ghost"
            onClick={add}
            disabled={pending || !newQ.trim() || !newA.trim()}
          >
            {t("faqAdd")}
          </Button>
        </div>
      </div>

      <FieldError message={error ? t(error) : null} />
    </div>
  );
}
