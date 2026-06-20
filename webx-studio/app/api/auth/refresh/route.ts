// Silent session renewal: exchange the rotating refresh token for a fresh
// access token and rotate both httpOnly cookies. Called by the client on a timer.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { strapiRefresh } from "@/lib/strapi";
import { SESSION_COOKIE, SESSION_TTL, REFRESH_COOKIE, REFRESH_TTL } from "@/lib/config";

export async function POST() {
  const jar = await cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!refresh) return NextResponse.json({ ok: false }, { status: 401 });
  const res = await strapiRefresh(refresh);
  if (!res) return NextResponse.json({ ok: false }, { status: 401 });
  const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  jar.set(SESSION_COOKIE, res.token, { ...base, maxAge: SESSION_TTL });
  if (res.refresh) jar.set(REFRESH_COOKIE, res.refresh, { ...base, maxAge: REFRESH_TTL });
  return NextResponse.json({ ok: true });
}
