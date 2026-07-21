// /api/auth/google/signout — clear the identity cookie.
//
// Called by the client when the user clicks "Sign out". The client is also
// responsible for purging its localStorage session; this route only handles
// the server-readable half of the session.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { INTERLOCK_USER_COOKIE } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const store = await cookies();
  store.delete(INTERLOCK_USER_COOKIE);
  return NextResponse.json({ ok: true });
}
