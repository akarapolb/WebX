// Server-only Strapi helpers. The opaque admin session token never leaves the server;
// it is read from the httpOnly cookie and attached here (BFF pattern).
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { STRAPI_URL, SESSION_COOKIE, ENGINE_COOKIE } from "./config";

// Lets a caller with no incoming request/cookies (the Phase 5 release
// scheduler — see lib/cms/governance.ts's processDueReleases, which has no
// admin session to read a cookie from) supply a token explicitly for the
// duration of an async call tree. cms/{strapi,wordpress}.ts both read
// whichever engine's token they need through this same sessionToken(), so
// one override point covers either adapter.
const tokenOverride = new AsyncLocalStorage<string>();
export function withServiceToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
  return tokenOverride.run(token, fn);
}

export async function sessionToken(): Promise<string | null> {
  const override = tokenOverride.getStore();
  if (override) return override;
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Which engine this session's token authenticates against — set at login
 * (app/api/auth/login/route.ts) from the target tenant's own engine field,
 * not a global switch (Phase 6). Defaults to "strapi" for older sessions
 * created before this cookie existed. */
export async function sessionEngine(): Promise<"strapi" | "wordpress"> {
  const jar = await cookies();
  return jar.get(ENGINE_COOKIE)?.value === "wordpress" ? "wordpress" : "strapi";
}

/** Exchange admin credentials for an opaque session token (Strapi 5 /admin/login). */
export async function strapiLogin(email: string, password: string) {
  let r: Response;
  try {
    r = await fetch(`${STRAPI_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    // Backend unreachable (Strapi not running, wrong STRAPI_URL, network down).
    return { ok: false as const, network: true as const };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.data?.token) return { ok: false as const, status: r.status };
  return { ok: true as const, token: j.data.token as string, refresh: refreshFromHeaders(r.headers), user: j.data.user };
}

/** Pull Strapi's rotating admin refresh token out of the Set-Cookie header. */
function refreshFromHeaders(headers: Headers): string | null {
  const list = (headers as any).getSetCookie?.() ?? [];
  for (const c of list) {
    const m = /^strapi_admin_refresh=([^;]+)/.exec(c);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

/** Exchange the (single-use, rotating) refresh token for a fresh access token. */
export async function strapiRefresh(refreshToken: string): Promise<{ token: string; refresh: string | null } | null> {
  try {
    const r = await fetch(`${STRAPI_URL}/admin/access-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `strapi_admin_refresh=${encodeURIComponent(refreshToken)}` },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const token = j?.data?.token ?? j?.token;
    if (!token) return null;
    return { token, refresh: refreshFromHeaders(r.headers) };
  } catch {
    return null;
  }
}

/** Validate a token by self-calling /admin/users/me (the token is opaque, not a JWT). */
export async function strapiMe(token: string) {
  const r = await fetch(`${STRAPI_URL}/admin/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.data ?? null;
}

/** Authenticated GET against Strapi using the current session cookie. Returns null on any failure. */
export async function strapiGet<T = any>(path: string): Promise<T | null> {
  const token = await sessionToken();
  if (!token) return null;
  try {
    const r = await fetch(`${STRAPI_URL}${path.startsWith("/") ? "" : "/"}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
