/**
 * FieldError — inline validation message under a form field (DESIGN_SPEC §3:
 * coral is the urgent/error accent). Renders nothing when there's no message,
 * so callers can pass a possibly-undefined error straight through.
 */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-coral-600">{message}</p>;
}
