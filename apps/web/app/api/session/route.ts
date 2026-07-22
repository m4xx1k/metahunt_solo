import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "@/lib/api/session-cookie";

// Bridges the client-side session JWT (localStorage, see auth-token.ts) into
// an httpOnly cookie so (investigation) Server Components can forward it as
// a Bearer token — the browser never sends localStorage to the server, so
// admin API reads during SSR were otherwise unauthenticated. See
// md/runbook/telegram-auth.md #Roles/admin.
export async function POST(request: Request) {
  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
