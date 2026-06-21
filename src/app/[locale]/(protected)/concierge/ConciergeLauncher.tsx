import { isKillSwitchActive } from "@/lib/concierge/cost";
import { ConciergeWidget } from "./ConciergeWidget";

/**
 * ConciergeLauncher — server gate for the floating concierge (v3). Mounted once in the
 * locale layout. Renders nothing while the cost kill-switch is active (the brand goes
 * quiet — no dead FAB); otherwise the client widget. Shown to all visitors (the chat
 * API rate-limits anonymous callers; booking-confirm still requires phone verification).
 * READ-ONLY consumer of lib/concierge — no eval-gated change.
 */
export async function ConciergeLauncher() {
  if (await isKillSwitchActive()) return null;
  return <ConciergeWidget />;
}
