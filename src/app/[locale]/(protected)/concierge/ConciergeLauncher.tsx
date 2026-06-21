import { auth } from "@/lib/auth/auth";
import { isKillSwitchActive } from "@/lib/concierge/cost";
import { ConciergeWidget } from "./ConciergeWidget";

/**
 * ConciergeLauncher — server gate for the floating concierge widget. Renders it only
 * for signed-in consumer users with the monthly kill-switch OFF. Mounted once in the
 * locale root layout so the assistant floats across the app (no dedicated nav tab).
 */
export async function ConciergeLauncher() {
  const session = await auth();
  if (!session?.user) return null;
  if (await isKillSwitchActive()) return null;
  return <ConciergeWidget />;
}
