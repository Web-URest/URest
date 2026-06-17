import { getTranslations } from "next-intl/server";

import { requireHostEligible } from "@/lib/auth/guards";
import { getHostCalendar } from "@/lib/listing/calendar";
import { getHostListings } from "@/lib/listing/queries";

import { CalendarManager } from "./calendar-manager";

/**
 * Host calendar (PRODUCT_FLOWS §4.2 ปฏิทิน) — one calendar per villa via the
 * switcher (never a merged view). Server-driven villa selection through `?listing=`;
 * blocks for the selected villa are loaded here and the manager toggles them.
 */
export default async function HostCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const user = await requireHostEligible();
  const [t, listings] = await Promise.all([
    getTranslations("Host"),
    getHostListings(user.id),
  ]);

  if (listings.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-3xl text-ink-900">{t("calendarTitle")}</h1>
        <p className="rounded-card border border-line bg-white p-6 text-center text-ink-700">
          {t("calendarNoListings")}
        </p>
      </div>
    );
  }

  const { listing: requested } = await searchParams;
  const selected =
    listings.find((l) => l.id === requested) ?? listings[0]!;

  const from = new Date();
  from.setUTCDate(1);
  from.setUTCHours(0, 0, 0, 0);
  const blocks = await getHostCalendar(selected.id, user.id, from);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl text-ink-900">{t("calendarTitle")}</h1>
      <p className="text-ink-700">{t("calendarIntro")}</p>
      <CalendarManager
        listings={listings.map((l) => ({
          id: l.id,
          title: l.title,
          bookingMode: l.bookingMode,
        }))}
        selectedId={selected.id}
        blocks={blocks.map((b) => ({
          id: b.id,
          startDate: b.startDate.toISOString(),
          endDate: b.endDate.toISOString(),
        }))}
      />
    </div>
  );
}
