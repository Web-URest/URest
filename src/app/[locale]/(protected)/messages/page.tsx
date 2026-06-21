import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { listThreadsForUser } from "@/lib/messaging/thread";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Messages inbox (PRODUCT_FLOWS §3.5 / §4.2 "one inbox"). The user's booking threads
 * — as guest or host — newest activity first, with a last-message preview + unread badge.
 */
export default async function MessagesPage() {
  const [user, t] = await Promise.all([requireUser(), getTranslations("Messages")]);
  const threads = await listThreadsForUser(user.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-[680px] flex-col gap-3 px-4 py-8 md:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-900">{t("title")}</h1>
      {threads.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        threads.map((th) => (
          <Link
            key={th.bookingId}
            href={`/messages/${th.bookingId}`}
            className="flex items-center gap-3 rounded-card border border-border-subtle bg-white p-4 shadow-card transition hover:bg-surface-50"
          >
            <Avatar name={th.otherPartyName} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-900">
                {th.otherPartyName} <span className="font-normal text-ink-500">· {th.listingTitle}</span>
              </p>
              <p className="truncate text-sm text-ink-500">{th.lastMessage ?? t("noPreview")}</p>
            </div>
            {th.unread > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-semibold text-white">
                {th.unread}
              </span>
            )}
          </Link>
        ))
      )}
    </main>
  );
}
