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

  // `next.startsWith("/")` alone lets a protocol-relative value through —
  // "//evil.com" passes that check but new URL("//evil.com", req.url)
  // resolves to https://evil.com, an open redirect at the end of a real
  // login flow. Found in a full-codebase audit (2026-09-12). Reject "//"
  // explicitly and, as a second check, confirm the resolved URL is
  // actually same-origin before trusting it.
  let dest = "/dashboard";
  if (pending.next && pending.next.startsWith("/") && !pending.next.startsWith("//")) {
    const resolved = new URL(pending.next, req.url);
    if (resolved.origin === new URL(req.url).origin) dest = pending.next;
  }
  return NextResponse.redirect(new URL(dest, req.url));
}
