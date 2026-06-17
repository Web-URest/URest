"use client";

import { BookingMode } from "@prisma/client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { ListingSwitcher } from "@/components/ui/ListingSwitcher";
import { usePathname, useRouter } from "@/i18n/navigation";

import { toggleBlockAction } from "./actions";

interface ManagerListing {
  id: string;
  title: string;
  bookingMode: string;
}
interface SerializedBlock {
  id: string;
  startDate: string;
  endDate: string;
}

/**
 * Client wrapper for the host calendar: villa switcher + interactive grid. Villa
 * selection is server-driven (`?listing=`) so blocks always come fresh from the
 * server; toggles run the action then `router.refresh()` to re-pull blocks.
 */
export function CalendarManager({
  listings,
  selectedId,
  blocks,
}: {
  listings: ManagerListing[];
  selectedId: string;
  blocks: SerializedBlock[];
}) {
  const t = useTranslations("Host");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const selected = listings.find((l) => l.id === selectedId);
  const isInstant = selected?.bookingMode === BookingMode.INSTANT;

  const gridBlocks = blocks.map((b) => ({
    id: b.id,
    startDate: new Date(b.startDate),
    endDate: new Date(b.endDate),
  }));

  function selectVilla(id: string) {
    router.replace(`${pathname}?listing=${id}`);
  }

  function toggle(ymd: string, blockId: string | null) {
    startTransition(async () => {
      const res = await toggleBlockAction(selectedId, ymd, blockId);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ListingSwitcher listings={listings} selectedId={selectedId} onSelect={selectVilla} />

      <div
        className={`rounded-card border p-4 text-sm ${
          isInstant
            ? "border-coral-500 bg-coral-100 text-coral-600"
            : "border-line bg-sand-100 text-ink-700"
        }`}
      >
        {isInstant ? t("strikeWarningInstant") : t("strikeWarning")}
      </div>

      <CalendarGrid blocks={gridBlocks} onToggleDate={toggle} pending={pending} />
    </div>
  );
}
