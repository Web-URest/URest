import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { auth } from "@/lib/auth/auth";
import { redirect } from "@/i18n/navigation";

/**
 * Single auth gate for all protected routes (/saved, /trips, /messages, /profile).
 * Reads x-pathname (set by middleware) so the sign-in page can redirect back after login.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) {
    const [h, locale] = await Promise.all([headers(), getLocale()]);
    const raw = h.get("x-pathname") ?? "/";
    // Guard against open-redirect: pathname must be a relative path on this origin.
    const pathname =
      raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
    redirect({
      href: `/sign-in?callbackUrl=${encodeURIComponent(pathname)}`,
      locale,
    });
  }
  return <>{children}</>;
}
