import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { selfServeSignup } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import { SESSION_COOKIE, SESSION_TTL, REFRESH_COOKIE, REFRESH_TTL, ENGINE_COOKIE } from "@/lib/config";

// Public, unauthenticated — this is the whole point (see governance.ts's
// selfServeSignup for what it actually does: creates a Strapi-engine,
// free-plan tenant + its first admin account, then logs them straight in).
// Mirrors /api/auth/login's own cookie-setting exactly, since a successful
// signup ends in the same state a login would.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const { token, refresh } = await selfServeSignup(body);
    const jar = await cookies();
    const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
    jar.set(SESSION_COOKIE, token, { ...base, maxAge: SESSION_TTL });
    jar.set(ENGINE_COOKIE, "strapi", { ...base, maxAge: SESSION_TTL });
    if (refresh) jar.set(REFRESH_COOKIE, refresh, { ...base, maxAge: REFRESH_TTL });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CmsError) return NextResponse.json({ error: e.message }, { status: e.status || 500 });
    return NextResponse.json({ error: "Cannot reach the backend." }, { status: 502 });
  }
}
