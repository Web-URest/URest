import { exportUserData } from "@/lib/account";
import { requireUser } from "@/lib/auth/guards";

/**
 * PDPA data export (#35, PRODUCT_FLOWS §3.7) — streams the signed-in user's data as
 * a JSON file download. Auth via the verification-ladder guard (DB session).
 */
export async function GET(): Promise<Response> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const data = await exportUserData(userId);
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="urest-data-${userId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
