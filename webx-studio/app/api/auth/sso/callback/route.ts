import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSsoRuntimeConfig, ssoLogin } from "@/lib/cms/governance";
import { exchangeCode } from "@/lib/oidc";
import { CmsError } from "@/lib/cms/types";
import { SESSION_COOKIE, SESSION_TTL, REFRESH_COOKIE, REFRESH_TTL, ENGINE_COOKIE, SSO_PENDING_COOKIE } from "@/lib/config";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const pendingRaw = jar.get(SSO_PENDING_COOKIE)?.value;
  jar.delete(SSO_PENDING_COOKIE);
  if (!pendingRaw) return NextResponse.redirect(new URL("/login?error=sso_expired", req.url));

  let pending: { tenantKey: string; codeVerifier: string; state: string; next?: string };
  try { pending = JSON.parse(pendingRaw); }
  catch { return NextResponse.redirect(new URL("/login?error=sso_expired", req.url)); }

  const cfg = await resolveSsoRuntimeConfig(pending.tenantKey);
  if (!cfg) return NextResponse.redirect(new URL(`/login?tenant=${encodeURIComponent(pending.tenantKey)}&error=sso_disabled`, req.url));

  let result: { email: string };
  try {
    result = await exchangeCode(cfg, new URL(req.url), pending.codeVerifier, pending.state);
  } catch {
    return NextResponse.redirect(new URL(`/login?tenant=${encodeURIComponent(pending.tenantKey)}&error=sso_failed`, req.url));
  }

  let login: { token: string; refresh: string | null };
  try {
    login = await ssoLogin(pending.tenantKey, result.email);
  } catch (e) {
    const msg = e instanceof CmsError ? e.message : "sso_failed";
    return NextResponse.redirect(new URL(`/login?tenant=${encodeURIComponent(pending.tenantKey)}&error=${encodeURIComponent(msg)}`, req.url));
  }

  const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  jar.set(SESSION_COOKIE, login.token, { ...base, maxAge: SESSION_TTL });
  jar.set(ENGINE_COOKIE, "strapi", { ...base, maxAge: SESSION_TTL });
  if (login.refresh) jar.set(REFRESH_COOKIE, login.refresh, { ...base, maxAge: REFRESH_TTL });

  const dest = pending.next && pending.next.startsWith("/") ? pending.next : "/dashboard";
  return NextResponse.redirect(new URL(dest, req.url));
}
