import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveSsoRuntimeConfig } from "@/lib/cms/governance";
import { buildAuthorizationRequest } from "@/lib/oidc";
import { SSO_PENDING_COOKIE, SSO_PENDING_TTL } from "@/lib/config";

export async function GET(req: NextRequest) {
  const tenantKey = req.nextUrl.searchParams.get("tenant") || "";
  const next = req.nextUrl.searchParams.get("next") || "";
  if (!tenantKey) return NextResponse.redirect(new URL("/login?error=missing_tenant", req.url));

  const cfg = await resolveSsoRuntimeConfig(tenantKey);
  if (!cfg) return NextResponse.redirect(new URL(`/login?tenant=${encodeURIComponent(tenantKey)}&error=sso_disabled`, req.url));

  const redirectUri = new URL("/api/auth/sso/callback", req.url).toString();
  let built: { url: string; codeVerifier: string; state: string };
  try {
    built = await buildAuthorizationRequest(cfg, redirectUri);
  } catch {
    return NextResponse.redirect(new URL(`/login?tenant=${encodeURIComponent(tenantKey)}&error=sso_failed`, req.url));
  }

  const jar = await cookies();
  const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  jar.set(SSO_PENDING_COOKIE, JSON.stringify({ tenantKey, codeVerifier: built.codeVerifier, state: built.state, next }), {
    ...base, maxAge: SSO_PENDING_TTL,
  });
  return NextResponse.redirect(built.url);
}
