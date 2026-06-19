// Server-only Strapi helpers. The opaque admin session token never leaves the server;
// it is read from the httpOnly cookie and attached here (BFF pattern).
import "server-only";
import { cookies } from "next/headers";
import { STRAPI_URL, SESSION_COOKIE } from "./config";

export async function sessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
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
  return { ok: true as const, token: j.data.token as string, user: j.data.user };
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
