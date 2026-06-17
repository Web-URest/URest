/**
 * Contact info is hidden between guest and host until the booking is CONFIRMED
 * (payment succeeded → `Booking.contactUnmaskedAt` set, #21b). Before that the
 * UI shows masked placeholders. Single source of truth for that gate.
 */
interface Contact {
  email: string | null;
  phone: string | null;
}

export function maskedContact(unmaskedAt: Date | null, contact: Contact): Contact {
  if (unmaskedAt) return contact;
  return { email: null, phone: null };
}
