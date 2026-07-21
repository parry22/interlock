"use client";

// Client-side session hook.
//
// Returns the user's IDENTITY (address + Google name/email/picture) as the
// server resolves it via /api/me — that endpoint substitutes the
// platform-configured signer's address for `suiAddress` so every UI surface
// lines up with the data the dashboard scopes to. The localStorage Google
// session is still used internally by the chip cache but is no longer the
// source of truth for what we display.

import { useEffect, useState } from "react";

export type ClientSession = {
  suiAddress: string;
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

/** Read the current user from /api/me. `null` until the fetch resolves. */
export function useAuthSession(): ClientSession | null {
  const [session, setSession] = useState<ClientSession | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { user: ClientSession | null };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!cancelled) setSession(json.user);
      } catch {
        // network blip — keep state null
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return session;
}
