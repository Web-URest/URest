import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { listThreadsForUser } from "@/lib/messaging/thread";

/**
 * Messages inbox (PRODUCT_FLOWS §3.5 / §4.2 "one inbox"). The user's booking threads
 * — as guest or host — newest activity first, with a last-message preview + unread badge.
 */
export default async function MessagesPage() {
  const [user, t] = await Promise.all([requireUser(), getTranslations("Messages")]);
  const threads = await listThreadsForUser(user.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-3 bg-sand-50 px-4 py-8 md:px-6">
      <h1 className="font-display text-2xl text-ink-900">{t("title")}</h1>
      {threads.length === 0 ? (
        <p className="text-sm text-ink-900/60">{t("empty")}</p>
      ) : (
        threads.map((th) => (
          <Link
            key={th.bookingId}
            href={`/messages/${th.bookingId}`}
            className="flex items-center justify-between gap-3 rounded-card border border-line bg-white p-4 shadow-card transition hover:bg-sand-50"
          >
            <div className="min-w-0">
              <p className="font-display text-ink-900">
                {th.otherPartyName} · {th.listingTitle}
              </p>
              <p className="truncate text-sm text-ink-900/60">{th.lastMessage ?? t("noPreview")}</p>
            </div>
            {th.unread > 0 && (
              <span className="shrink-0 rounded-full bg-coral-500 px-2 py-0.5 text-xs font-semibold text-white">
                {th.unread}
              </span>
            )}
          </Link>
        ))
      )}
    </main>
  );
}
