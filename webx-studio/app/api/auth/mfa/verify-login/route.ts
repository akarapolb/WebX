import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLoginMfaCode } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import {
  SESSION_COOKIE, SESSION_TTL, REFRESH_COOKIE, REFRESH_TTL, ENGINE_COOKIE,
  MFA_PENDING_COOKIE,
} from "@/lib/config";

// Step 2 of an MFA-enrolled login — /api/auth/login already verified the
// password and stashed the real token in MFA_PENDING_COOKIE rather than the
// real session cookie. This checks the code and, only if it's right,
// promotes that stashed token into the actual session — same cookie-setting
// as a normal login, just gated on one more step.
export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({}));
  const jar = await cookies();
  const pending = jar.get(MFA_PENDING_COOKIE)?.value;
  if (!pending) return NextResponse.json({ error: "Session expired — please sign in again" }, { status: 401 });

  let staged: { token: string; refresh: string | null; email: string };
  try {
    staged = JSON.parse(pending);
  } catch {
    return NextResponse.json({ error: "Session expired — please sign in again" }, { status: 401 });
  }

  try {
    const ok = await verifyLoginMfaCode(staged.email, String(code || ""));
    if (!ok) return NextResponse.json({ error: "Incorrect code" }, { status: 401 });
  } catch (e) {
    if (e instanceof CmsError) return NextResponse.json({ error: e.message }, { status: e.status || 401 });
    return NextResponse.json({ error: "Cannot reach the backend." }, { status: 502 });
  }

  const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  jar.set(SESSION_COOKIE, staged.token, { ...base, maxAge: SESSION_TTL });
  jar.set(ENGINE_COOKIE, "strapi", { ...base, maxAge: SESSION_TTL });
  if (staged.refresh) jar.set(REFRESH_COOKIE, staged.refresh, { ...base, maxAge: REFRESH_TTL });
  jar.delete(MFA_PENDING_COOKIE);
  return NextResponse.json({ ok: true, user: { email: staged.email } });
}
