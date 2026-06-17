"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { VillaCard, type Villa } from "@/components/ui/VillaCard";
import { HeartButton } from "@/components/ui/HeartButton";
import { toggleSaveAction } from "./actions";

export type SavedItem = Villa & { id: string };

export function SavedGrid({ initialItems }: { initialItems: SavedItem[] }) {
  const t = useTranslations("SavedVillas");
  const [items, setItems] = useState(initialItems);
  // Pending undo: id of the last removed item + its data
  const [pendingUndo, setPendingUndo] = useState<SavedItem | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  // Clear undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  function handleUnsaved(item: SavedItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setPendingUndo(item);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setPendingUndo(null), 4000);
  }

  function handleUndo() {
    if (!pendingUndo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const restored = pendingUndo;
    setPendingUndo(null);
    setItems((prev) => [restored, ...prev]); // optimistic restore
    startTransition(async () => {
      const result = await toggleSaveAction(restored.id, true);
      if (!result.ok) {
        // Re-save failed — remove from list again
        setItems((prev) => prev.filter((i) => i.id !== restored.id));
      }
    });
  }

  if (items.length === 0 && !pendingUndo) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="font-display text-2xl text-ink-900">{t("emptyTitle")}</p>
        <p className="text-sm text-ink-900/60">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="relative">
            <Link href={`/listings/${item.id}`}>
              <VillaCard
                villa={item}
                heartSlot={
                  <HeartButton
                    listingId={item.id}
                    initialSaved
                    onUnsaved={() => handleUnsaved(item)}
                  />
                }
              />
            </Link>
          </div>
        ))}
      </div>

      {/* Undo snackbar */}
      {pendingUndo && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink-900 px-5 py-3 text-sm text-white shadow-card">
          <span>{t("unsaved")}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="font-semibold text-aqua-300 underline-offset-2 hover:underline"
          >
            {t("undo")}
          </button>
        </div>
      )}
    </>
  );
}
