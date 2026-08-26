import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { strapiLogin } from "@/lib/strapi";
import { wordpressLogin } from "@/lib/wordpress";
import { SESSION_COOKIE, SESSION_TTL, REFRESH_COOKIE, REFRESH_TTL, ENGINE_COOKIE, MFA_PENDING_COOKIE, MFA_PENDING_TTL } from "@/lib/config";
import { isMfaEnabled } from "@/lib/cms/governance";

export async function POST(req: Request) {
  const { email, password, engine } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }
  const jar = await cookies();
  const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

  // Which engine to authenticate against comes from the login form itself
  // (Phase 6 — engine is a per-tenant field, not a deployment-wide switch;
  // see docs/TECHNICAL.md), not inferred by trying both — that would double
  // login attempts against Strapi's own admin-login rate limiter for every
  // WordPress-tenant sign-in.
  if (engine === "wordpress") {
    // WordPress Application Passwords: "email" here is actually the WP
    // username, "password" the application password. Long-lived, no
    // rotation — no refresh cookie needed (see /api/auth/refresh).
    const res = await wordpressLogin(email, password);
    if (!res.ok) {
      if ("network" in res) return NextResponse.json({ error: "Cannot reach WordPress. Make sure it is running." }, { status: 502 });
      return NextResponse.json({ error: "Invalid username or application password" }, { status: 401 });
    }
    jar.set(SESSION_COOKIE, res.token, { ...base, maxAge: SESSION_TTL });
    jar.set(ENGINE_COOKIE, "wordpress", { ...base, maxAge: SESSION_TTL });
    return NextResponse.json({ ok: true, user: { email: res.user?.email || res.user?.name } });
  }

  const res = await strapiLogin(email, password);
  if (!res.ok) {
    if ("network" in res) {
      return NextResponse.json(
        { error: "Cannot reach the Strapi backend. Make sure it is running." },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  // Real per-user MFA (see governance.ts's MFA functions) — opt-in per
  // admin, so an un-enrolled account's login is completely unaffected by
  // any of this. An enrolled account's real token isn't promoted to the
  // actual session cookie yet: it's stashed in a short-lived, distinct
  // cookie until a correct code lands at /api/auth/mfa/verify-login. Still
  // httpOnly throughout — the token never reaches client JS either way.
  if (await isMfaEnabled(email).catch(() => false)) {
    jar.set(MFA_PENDING_COOKIE, JSON.stringify({ token: res.token, refresh: res.refresh ?? null, email }), {
      ...base, maxAge: MFA_PENDING_TTL,
    });
    return NextResponse.json({ mfaRequired: true });
  }
  // Token is stored httpOnly — it never reaches client JavaScript (BFF security model).
  jar.set(SESSION_COOKIE, res.token, { ...base, maxAge: SESSION_TTL });
  jar.set(ENGINE_COOKIE, "strapi", { ...base, maxAge: SESSION_TTL });
  // store the rotating refresh token so the session can be silently renewed
  if (res.refresh) jar.set(REFRESH_COOKIE, res.refresh, { ...base, maxAge: REFRESH_TTL });
  return NextResponse.json({ ok: true, user: { email: res.user?.email } });
}
