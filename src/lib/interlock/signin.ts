"use client";

// Reusable Google sign-in trigger.
//
// Generates a random nonce, parks it in sessionStorage, then redirects to
// Google's OAuth consent screen. Google bounces back to
// /auth/google/callback which verifies the id_token server-side and sets the
// identity cookie.
//
// Source of truth — every "Request Access" / sign-in CTA uses this helper so
// there's one place that knows the OAuth params.

import { GOOGLE_SESSION_KEY, GOOGLE_PENDING_KEY } from "@/components/GoogleSignInButton";
import { GOOGLE_AUTH_CONFIG } from "@/lib/interlock/google";

export type SignInOptions = {
  /** Where to land after a successful round-trip. Defaults to /dashboard. */
  next?: string;
};

/**
 * Kick off the Google OAuth round-trip. If the user is already signed in (a
 * session cookie + localStorage entry exist), navigates directly to `next`
 * instead of going back through Google.
 */
export async function startGoogleSignIn(opts?: SignInOptions): Promise<void> {
  const next = opts?.next ?? "/dashboard";

  // Already signed in? Don't bounce through Google again.
  if (typeof window !== "undefined") {
    try {
      const existing = localStorage.getItem(GOOGLE_SESSION_KEY);
      if (existing) {
        window.location.href = next;
        return;
      }
    } catch {
      // ignore — fall through to full flow
    }
  }

  // 1. Random nonce — OIDC replay protection for the id_token flow.
  const nonce = crypto.randomUUID();

  // 2. Park state so the callback page can verify the nonce + know where to land.
  sessionStorage.setItem(GOOGLE_PENDING_KEY, JSON.stringify({ nonce, next }));

  // 3. Redirect to Google.
  const clientId = GOOGLE_AUTH_CONFIG.clientId;
  if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID not set");
  const redirectUri = `${window.location.origin}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "id_token",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    nonce,
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
