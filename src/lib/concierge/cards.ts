/**
 * In-chat card payloads the server attaches as a side-effect of a booking tool
 * call (#32). Pure types — no server imports — so the chat client can render
 * them. The QR url travels here, NEVER in the model's message content (AC#4).
 */
export type ConciergeCard =
  | {
      kind: "booking_draft";
      draftId: string;
      title: string;
      checkIn: string;
      checkOut: string;
      nights: number;
      guests: number;
      totalThb: number;
      priceLines: { date: string; rule: string; season?: string; priceThb: number }[];
    }
  | { kind: "payment_qr"; bookingId: string; code: string | null; qrUrl?: string; payUrl: string }
  | { kind: "request_sent"; bookingId: string; code: string | null; tripUrl: string };
