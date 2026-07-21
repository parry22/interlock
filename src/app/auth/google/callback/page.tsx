"use client";

// Google redirects here with `id_token=<JWT>` in the URL fragment (because
// our auth request used response_type=id_token, which always uses the
// fragment for security). This page:
//
//   1. Extracts the JWT from window.location.hash
//   2. Reads the nonce stashed before the redirect
//   3. POSTs to /api/auth/google/verify to check the signature + nonce
//   4. Stores the (non-sensitive) identity in localStorage
//   5. Navigates back to wherever the sign-in flow targeted

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GOOGLE_PENDING_KEY,
  GOOGLE_SESSION_KEY,
} from "@/components/GoogleSignInButton";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 1. Pull id_token out of the URL fragment.
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const fragmentParams = new URLSearchParams(hash);
        const idToken = fragmentParams.get("id_token");
        if (!idToken) {
          throw new Error("no id_token in URL fragment — did Google redirect correctly?");
        }

        // 2. Read the nonce we stashed before redirecting.
        const pendingRaw = sessionStorage.getItem(GOOGLE_PENDING_KEY);
        if (!pendingRaw) {
          throw new Error("no pending sign-in state — sessionStorage was cleared between redirects");
        }
        const pending = JSON.parse(pendingRaw) as { nonce: string; next?: string };

        // 3. Ask the server to verify the JWT signature + nonce.
        const verifyResp = await fetch("/api/auth/google/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, nonce: pending.nonce }),
        });
        const verifyJson = await verifyResp.json();
        if (!verifyResp.ok) {
          throw new Error(verifyJson.error ?? `verify ${verifyResp.status}`);
        }

        // 4. Persist the (non-sensitive) session.
        const session = {
          sub: verifyJson.sub,
          email: verifyJson.email,
          name: verifyJson.name,
          picture: verifyJson.picture,
          createdAtMs: Date.now(),
        };
        localStorage.setItem(GOOGLE_SESSION_KEY, JSON.stringify(session));
        sessionStorage.removeItem(GOOGLE_PENDING_KEY);

        // 5. Bounce back to the app — to wherever the sign-in flow targeted.
        //    Validate that `next` is a relative path so we can't be redirected
        //    off-site by tampering with sessionStorage.
        const safeNext =
          pending.next && pending.next.startsWith("/") && !pending.next.startsWith("//")
            ? pending.next
            : "/dashboard";
        router.replace(safeNext);
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
      }
    })();
    // Run exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-white px-6">
      {status === "working" ? (
        <>
          <div className="text-[14px] font-semibold mb-2">Completing sign-in…</div>
          <p className="text-[12px] text-[#5a5a5a] max-w-md text-center">
            Verifying your Google identity.
          </p>
        </>
      ) : (
        <>
          <div className="text-[14px] font-semibold text-[#f87171] mb-2">Sign-in failed</div>
          <p className="text-[12px] text-[#fca5a5] max-w-md text-center font-mono break-all">
            {error}
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 px-4 py-2 rounded-full text-[12px] bg-[#1e1e1e] border border-[#272727] text-[#a3a3a3] hover:text-white"
          >
            Back to dashboard
          </button>
        </>
      )}
    </div>
  );
}
