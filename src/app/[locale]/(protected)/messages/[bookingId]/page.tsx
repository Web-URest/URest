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
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-4 bg-sand-50 px-4 py-6 md:px-6">
      <Link href="/messages" className="text-sm text-ink-900/60 hover:text-ink-900">
        {t("back")}
      </Link>
      <h1 className="font-display text-xl text-ink-900">{thread.listingTitle}</h1>

      <p
        className={`rounded-card px-4 py-2 text-xs ${
          thread.contactUnmasked ? "bg-jade-100 text-jade-500" : "bg-gold-100 text-gold-800"
        }`}
      >
        {thread.contactUnmasked ? t("unmaskedNote") : t("maskingNotice")}
      </p>

      <div className="flex flex-1 flex-col gap-2">
        {thread.messages.length === 0 ? (
          <p className="text-sm text-ink-900/50">{t("empty")}</p>
        ) : (
          thread.messages.map((m) => {
            const mine = m.senderId === thread.viewerId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <p
                  className={`max-w-[80%] whitespace-pre-wrap rounded-card px-4 py-2 text-sm shadow-card ${
                    mine ? "bg-aqua-500 text-white" : "bg-white text-ink-900"
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
