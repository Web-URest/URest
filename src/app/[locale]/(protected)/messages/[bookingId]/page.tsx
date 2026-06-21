import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { requirePhoneVerified } from "@/lib/auth/guards";
import { loadThreadForViewer, MessagingError } from "@/lib/messaging/thread";

/**
 * Per-booking message thread (PRODUCT_FLOWS §3.5). Participant-gated; renders the
 * masked message history (`bodyMasked` only) + the composer. The masking banner
 * states the pre-CONFIRMED redaction (PDPA/anti-scam honesty).
 */
import { MessageComposer } from "./message-composer";

export default async function ThreadPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const [{ bookingId }, t] = await Promise.all([params, getTranslations("Thread")]);

  let viewerId: string;
  try {
    viewerId = (await requirePhoneVerified()).id;
  } catch {
    notFound();
  }

  let thread: Awaited<ReturnType<typeof loadThreadForViewer>>;
  try {
    thread = await loadThreadForViewer(bookingId, viewerId);
  } catch (err) {
    if (err instanceof MessagingError) notFound();
    throw err;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-4 px-4 py-6 md:px-6">
      <Link href="/messages" className="text-sm text-ink-500 transition hover:text-ink-900">
        {t("back")}
      </Link>
      <h1 className="font-display text-xl font-bold text-ink-900">{thread.listingTitle}</h1>

      <p
        className={`rounded-card px-4 py-2.5 text-xs font-medium ${
          thread.contactUnmasked
            ? "bg-trust-50 text-trust-700"
            : "bg-pending-50 text-pending-700"
        }`}
      >
        {thread.contactUnmasked ? t("unmaskedNote") : t("maskingNotice")}
      </p>

      <div className="flex flex-1 flex-col gap-2">
        {thread.messages.length === 0 ? (
          <p className="text-sm text-ink-500">{t("empty")}</p>
        ) : (
          thread.messages.map((m) => {
            const mine = m.senderId === thread.viewerId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <p
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                    mine
                      ? "rounded-tr-sm bg-brand-50 text-ink-900"
                      : "rounded-tl-sm border border-border-subtle bg-white text-ink-900 shadow-card"
                  }`}
                >
                  {m.bodyMasked}
                </p>
              </div>
            );
          })
        )}
      </div>

      <MessageComposer bookingId={bookingId} />
    </main>
  );
}
