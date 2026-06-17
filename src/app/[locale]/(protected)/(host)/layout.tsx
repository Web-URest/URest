import { getLocale } from "next-intl/server";

import { AuthError, requireHostEligible } from "@/lib/auth/guards";
import { redirect } from "@/i18n/navigation";

import { HostNav } from "./host-nav";

/**
 * Host "back-of-house" shell (DESIGN_SPEC §4: ink topbar swap; §5.7 host nav).
 *
 * The redirect is UX convenience, NOT the security boundary — every host page and
 * server action re-checks `requireHostEligible` (ladder step 2; server actions
 * never run layouts). The parent `(protected)` layout already gates auth; this
 * layer additionally requires phone verification (host eligibility).
 */
export default async function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireHostEligible();
  } catch (e) {
    const locale = await getLocale();
    if (e instanceof AuthError && e.reason === "PHONE_UNVERIFIED") {
      redirect({ href: "/verify-phone", locale });
    }
    throw e;
  }

  return (
    <div className="min-h-screen bg-sand-50">
      <HostNav />
      <main className="mx-auto max-w-[1120px] px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}
