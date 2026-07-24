// Edge gate for authenticated routes.
//
// In Next 16 this file replaces `middleware.ts` (renamed to `proxy.ts`, see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
//
// Behavior:
//   • Anyone can hit the landing page (/), marketing pages, /auth/* (OAuth
//     callback), and /api/* (the callback page POSTs to /api/auth/google/verify
//     before the cookie exists).
//   • Visiting an authenticated route without the `interlock.user` cookie
//     redirects back to / so the landing CTA can re-trigger sign-in.
//
// Cookie spoofing note: passing this gate only proves you sent SOME identity
// cookie. Authorisation (whose data you can see) is enforced server-side by
// every API route + RSC reading the same cookie via getCurrentUser().

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { INTERLOCK_USER_COOKIE } from "@/lib/interlock/session";

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

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const cookie = request.cookies.get(INTERLOCK_USER_COOKIE);
  if (cookie?.value) return NextResponse.next();

  // Bounce back to landing with a hint so the CTA can auto-open the OAuth flow.
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("signin", "1");
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals + static assets + API routes (API routes do their own
  // identity checks where needed; gating them here would break the OAuth round-trip).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.svg|dashboard-hero.png|frame|robots.txt|sitemap.xml).*)"],
};
