import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/config";

// Basic per-IP rate limiting for the BFF's own API routes — previously
// nothing here at all (Strapi's own API had src/middlewares/rate-limit.ts;
// webx-studio's had no equivalent — TOR gap audit). Sliding window (a
// timestamp log per key), same shape as Strapi's own limiter, deliberately
// simple in-memory state: this matches the self-host/Docker-Compose
// deployment target (DEPLOY.md path A, one long-lived Node process) that's
// the realistic target for a DGA/on-prem TOR deployment; a multi-instance
// serverless deployment would need a shared store instead, out of scope here.
const hits = new Map<string, number[]>();

function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  let arr = hits.get(key);
  if (!arr) { arr = []; hits.set(key, arr); }
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  if (i > 0) arr.splice(0, i);
  if (arr.length >= max) return false;
  arr.push(now);
  return true;
}

function clientIp(req: NextRequest): string {
  // req.ip (Vercel-only, removed from NextRequest as of Next 15) isn't
  // available here — XFF is what DEPLOY.md's own reverse-proxy-in-front
  // assumption relies on; "unknown" only happens hitting Next directly
  // with no proxy in front (e.g. local dev), which shares one bucket.
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || "unknown";
}

const AUTH_PREFIX = "/api/auth/";

// Gate every app route on the presence of a session cookie. Token *validity* is
// re-checked server-side in the (app) layout via /admin/users/me.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (req.method === "POST" && pathname.startsWith("/api/")) {
    const ip = clientIp(req);
    // Tighter cap for login/signup/MFA-verify/SSO — the actual
    // brute-force/credential-stuffing surface, matches Strapi's own
    // /admin/login convention (10 per 10 min). Everything else under
    // /api/* gets the broader general-abuse backstop.
    const ok = pathname.startsWith(AUTH_PREFIX)
      ? hit("auth:" + ip, 10, 10 * 60 * 1000)
      : hit("api:" + ip, 60, 60 * 1000);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
    if (hits.size > 20000) {
      const evictBefore = Date.now() - 10 * 60 * 1000;
      for (const [k, arr] of hits) { if (!arr.length || arr[arr.length - 1] < evictBefore) hits.delete(k); }
    }
  }

  // login, signup (both public by definition — gating signup on already
  // having a session would defeat the point of it), the auth API, and
  // api/internal (its own secret-header auth — see
  // app/api/internal/releases/process-due, called by an external scheduler
  // with no session cookie) stay open, same as before — just no longer
  // excluded from the matcher entirely, since the rate limiter above still
  // needs to see them.
  if (
    pathname === "/login" || pathname === "/signup" ||
    pathname.startsWith(AUTH_PREFIX) || pathname.startsWith("/api/internal")
  ) {
    return NextResponse.next();
  }

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
