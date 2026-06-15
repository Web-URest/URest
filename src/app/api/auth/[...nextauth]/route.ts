import { handlers } from "@/lib/auth/auth";

// Auth.js catch-all route. Lives outside `[locale]` so the callback URL is
// `/api/auth/callback/line` (never locale-prefixed); the middleware matcher
// already excludes `/api`.
export const { GET, POST } = handlers;
