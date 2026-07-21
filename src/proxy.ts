// Edge gate for authenticated routes.
//
// In Next 16 this file replaces `middleware.ts` (renamed to `proxy.ts`, see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
//
// STATUS: Google auth gating is DISABLED for now — every route is open,
// including /dashboard and the rest of PROTECTED_PREFIXES below. The landing
// CTA now links straight to /dashboard instead of triggering sign-in.
// Pages/queries that used to require a session (e.g. dashboard/page.tsx) fall
// back to unscoped/platform-wide data when there's no `interlock.user` cookie.
//
// To re-enable: restore the commented-out body of proxy() below.
//
// Cookie spoofing note (still true if re-enabled): passing this gate only
// proves you sent SOME identity cookie. Authorisation (whose data you can
// see) is enforced server-side by every API route + RSC reading the same
// cookie via getCurrentUser().

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// import { INTERLOCK_USER_COOKIE } from "@/lib/interlock/session";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/workflows",
  "/quotes",
  "/settlement",
  "/margin",
  "/customers",
  "/developer",
  "/settings",
  "/pricing-intel",
  "/agents",
  "/marketplace",
];
void PROTECTED_PREFIXES; // kept for when the gate below is re-enabled

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for the commented-out re-enable path below
export function proxy(_request: NextRequest): NextResponse {
  return NextResponse.next();

  // --- previous gated behavior, restore to re-enable auth ---
  // const { pathname } = _request.nextUrl;
  // const isProtected = PROTECTED_PREFIXES.some(
  //   (p) => pathname === p || pathname.startsWith(`${p}/`),
  // );
  // if (!isProtected) return NextResponse.next();
  //
  // const cookie = _request.cookies.get(INTERLOCK_USER_COOKIE);
  // if (cookie?.value) return NextResponse.next();
  //
  // const url = _request.nextUrl.clone();
  // url.pathname = "/";
  // url.searchParams.set("signin", "1");
  // url.searchParams.set("next", pathname);
  // return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals + static assets + API routes (API routes do their own
  // identity checks where needed; gating them here would break the OAuth round-trip).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.svg|dashboard-hero.png|frame|robots.txt|sitemap.xml).*)"],
};
