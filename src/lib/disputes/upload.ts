/**
 * Dispute evidence photo upload (#26). Unlike review photos (public/CDN), dispute
 * evidence goes to the PRIVATE R2 bucket — it's case material (damage shots, chat
 * screenshots) seen only by the guest who filed it and admin in the case view, so
 * it's never CDN-served. Gated on the uploader being the booking's guest while the
 * booking is CHECKED_IN — the §5.3 window in which a dispute can be opened — so a
 * presigned PUT can't be minted for an arbitrary key. The returned `r2Key` is
 * persisted onto the booking `Report.photoKeys` by the dispute-open action.
 */
import { prisma } from "@/lib/db";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/listing/upload";
import { presignPut } from "@/lib/storage/r2";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface DisputePhotoUpload {
  /** PRIVATE-bucket object key persisted to the booking `Report.photoKeys`. */
  r2Key: string;
  /** Presigned PUT URL the browser uploads the bytes to (matching Content-Type). */
  uploadUrl: string;
}

/**
 * Validate + presign a dispute evidence photo, gated on the user being the guest
 * of a CHECKED_IN booking (the §5.3 dispute-open window). Throws on a wrong party,
 * wrong state, disallowed type, or out-of-range size BEFORE signing.
 */
export async function presignDisputePhotoUpload(
  args: { bookingId: string; byteLength: number; contentType: string },
  userId: string,
): Promise<DisputePhotoUpload> {
  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    select: { userId: true, status: true },
  });
  if (!booking) throw new Error("Booking not found");
  if (booking.userId !== userId) throw new Error("Not the booking's guest");
  if (booking.status !== "CHECKED_IN") throw new Error("Booking is not in the dispute window");

  if (!ACCEPTED_PHOTO_TYPES.includes(args.contentType)) {
    throw new Error(`Unsupported photo type: ${args.contentType}`);
  }
  if (args.byteLength <= 0 || args.byteLength > MAX_PHOTO_BYTES) {
    throw new Error(`Photo size out of range: ${args.byteLength} bytes`);
  }

  const ext = EXT_BY_TYPE[args.contentType] ?? "bin";
  const r2Key = `disputes/${args.bookingId}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = await presignPut({
    bucket: "private",
    key: r2Key,
    contentType: args.contentType,
    contentLength: args.byteLength,
  });
  return { r2Key, uploadUrl };
}
