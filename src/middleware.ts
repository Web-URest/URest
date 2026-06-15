import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  // Let locale-detection redirects (308/307) pass through untouched.
  if (intlResponse.status >= 300) {
    return intlResponse;
  }

  // For normal pass-through, forward pathname as a REQUEST header so that
  // server-component layouts can read it via headers() and build callbackUrls.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Preserve any cookies set by the intl middleware (e.g. NEXT_LOCALE preference).
  intlResponse.cookies.getAll().forEach((c) => {
    response.cookies.set(c.name, c.value);
  });

  return response;
}

export const config = {
  // Skip API routes, Next internals, and static files
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
