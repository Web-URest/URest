/**
 * PDPA export of a user's OWN sent messages (#35). Lives in lib/messaging because
 * it reads `Message.bodyRaw` (gate:bodyraw) — but this is the sender's own original
 * text, which they're entitled to in their data export, so the raw body is returned.
 */
import { prisma } from "@/lib/db";

export interface ExportedMessage {
  id: string;
  bookingId: string;
  body: string;
  wasMasked: boolean;
  createdAt: Date;
}

export async function exportSentMessages(userId: string): Promise<ExportedMessage[]> {
  const rows = await prisma.message.findMany({
    where: { senderId: userId },
    select: {
      id: true,
      bodyRaw: true,
      wasMasked: true,
      createdAt: true,
      thread: { select: { bookingId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    id: m.id,
    bookingId: m.thread.bookingId,
    body: m.bodyRaw,
    wasMasked: m.wasMasked,
    createdAt: m.createdAt,
  }));
}
