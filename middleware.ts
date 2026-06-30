import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// This middleware is a FAST PATH for UX only: it bounces clearly-unauthenticated
// visitors to /signin without hitting the database. It is NOT the security
// boundary. The authoritative checks run server-side in:
//   - src/app/(app)/layout.tsx   (auth() before rendering any app page)
//   - every API route            (getCurrentUserId() + checkChannelAccess())
// We use database sessions (revocable), which can't be validated in the Edge
// runtime, so we only check for the presence of the session cookie here.
// ---------------------------------------------------------------------------

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) =>
    request.cookies.has(name)
  );

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Only guard the app surface. Auth routes, the sign-in page, static assets and
// the API (which enforces its own auth) are excluded.
export const config = {
  matcher: ["/c/:path*"],
};
