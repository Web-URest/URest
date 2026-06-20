import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import type { NotifPrefs } from "@/lib/notifications/prefs";

import { DangerZone } from "./danger-zone";
import { NotificationPrefs } from "./notification-prefs";

export default async function ProfilePage() {
  const t = await getTranslations("Profile");
  const session = await auth();
  // The (protected) layout guarantees a session before we reach here.
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { displayName: true, email: true, phone: true, lineUserId: true, notificationPrefs: true },
      })
    : null;

  const prefs = (user?.notificationPrefs as NotifPrefs | null) ?? {};

  return (
    <main className="mx-auto max-w-[760px] space-y-8 px-4 py-12 md:px-6">
      <h1 className="font-display text-3xl text-ink-900">{t("title")}</h1>

      <section className="rounded-2xl border border-line bg-white p-6 shadow-card">
        <h2 className="font-display text-xl text-ink-900">{t("accountInfo")}</h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-700">{t("name")}</dt>
          <dd className="text-ink-900">{user?.displayName ?? "—"}</dd>
          <dt className="text-ink-700">{t("email")}</dt>
          <dd className="text-ink-900">{user?.email ?? "—"}</dd>
          <dt className="text-ink-700">{t("phone")}</dt>
          <dd className="text-ink-900">{user?.phone ?? "—"}</dd>
        </dl>
      </section>

      <NotificationPrefs initialPrefs={prefs} hasLine={!!user?.lineUserId} />
      <DangerZone />
    </main>
  );
}
