// Server-only WordPress login helper — mirrors lib/strapi.ts's shape, but
// WordPress's auth model is structurally different (see the Phase 2 plan):
// Application Passwords are long-lived Basic-auth credentials, no separate
// token exchange and no rotation, so there's no equivalent of strapiRefresh.
// The "token" stored in the session cookie is the Basic-auth string itself.
import "server-only";
import { WORDPRESS_URL } from "./config";

export async function wordpressLogin(username: string, appPassword: string) {
  const basic = Buffer.from(username + ":" + appPassword).toString("base64");
  let r: Response;
  try {
    r = await fetch(WORDPRESS_URL + "/wp/v2/users/me?context=edit", {
      headers: { Authorization: "Basic " + basic },
      cache: "no-store",
    });
  } catch {
    return { ok: false as const, network: true as const };
  }
  if (!r.ok) return { ok: false as const, status: r.status };
  const user = await r.json().catch(() => null);
  if (!user?.id) return { ok: false as const, status: r.status };
  return { ok: true as const, token: basic, user };
}

/** Validate a stored session token (the Basic-auth string) — mirrors strapiMe(). */
export async function wordpressMe(token: string) {
  const r = await fetch(WORDPRESS_URL + "/wp/v2/users/me?context=edit", {
    headers: { Authorization: "Basic " + token },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return await r.json().catch(() => null);
}
