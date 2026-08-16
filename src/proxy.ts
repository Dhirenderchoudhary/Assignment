import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Bounces signed-out visitors away from /profile before it renders.
 *
 * The page itself already redirects, but /profile has a `loading.tsx`, and a
 * streamed route commits a 200 and flushes the skeleton before the redirect is
 * reached. Deciding here keeps it a real 307 and means nobody watches a
 * skeleton they were never going to be shown.
 *
 * This is a presence check on the cookie, not a verification. Anything more
 * would need the signing secret and a database round trip on every request;
 * `currentUser()` in the page stays the authority on whether a token is valid.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: "/profile" };
