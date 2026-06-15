import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // Set x-pathname on the incoming request so (protected) layouts can build
  // callbackUrls via headers(). Must be set BEFORE delegating so next-intl's
  // rewrite (used for unprefixed Thai routes) carries the header through.
  request.headers.set("x-pathname", request.nextUrl.pathname);
  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next internals, and static files
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
