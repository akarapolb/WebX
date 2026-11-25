// CSRF: refuse a state-changing request that the browser says another site made.
//
// The session is a cookie, and the browser attaches it to any request to this host, including one a page on ANOTHER site
// triggers (SameSite=Lax still sends it on a top-level navigation, and across sibling subdomains of one site). Nothing on
// the API asked who was calling, so a page the signed-in user happened to open could change a role, a workspace setting
// or the user's own second factor. The browser does say who: every current one sends Sec-Fetch-Site on every request, and
// any POST carries Origin. The rules follow Go's http.CrossOriginProtection:
//   - GET, HEAD and OPTIONS pass (nothing here changes on them);
//   - Sec-Fetch-Site same-origin or none passes; same-site (a sibling subdomain) and cross-site are refused unless the
//     Origin is one we trust (WEBX_TRUSTED_ORIGINS);
//   - without Sec-Fetch-Site (an old browser) the Origin must be this host or a trusted origin;
//   - with neither header the request did not come from a browser page (curl, a server, a test run): nothing a page can
//     cause lacks both, so it passes. Its cookie, if any, was put there by whoever sent it.
// The secret-protected /api/internal/* and Stripe's signed /api/webhooks/* are called by servers and are exempt.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Routes called by servers with their own proof (a shared secret, Stripe's signature), never by a page with a cookie. */
const EXEMPT_PREFIXES = ["/api/internal/", "/api/webhooks/"];

export function csrfExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

export type CsrfRequest = {
  method: string;
  origin?: string | null;
  secFetchSite?: string | null;
  /** The Host header as Studio received it. */
  host?: string | null;
  /** X-Forwarded-Host, for a proxy that rewrites Host. A page cannot set it: a custom header makes the browser ask first. */
  forwardedHost?: string | null;
};

function httpOrigin(value: string): URL | null {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null; // "null" (a sandboxed frame, a privacy redirect) and anything that is not a URL
  }
}

/** WEBX_TRUSTED_ORIGINS: comma-separated origins (https://admin.example.org) whose pages may post to this API. */
export function parseTrustedOrigins(raw: string | undefined | null): string[] {
  const out: string[] = [];
  for (const part of (raw || "").split(",")) {
    const u = part.trim() ? httpOrigin(part.trim()) : null;
    if (u) out.push(u.origin.toLowerCase());
  }
  return out;
}

/** Why this request is refused, or null when it may go on. */
export function crossSiteRefusal(req: CsrfRequest, trusted: readonly string[] = []): string | null {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return null;

  const origin = req.origin ? httpOrigin(req.origin) : null;
  const trustedOrigin = origin !== null && trusted.includes(origin.origin.toLowerCase());

  const site = (req.secFetchSite || "").trim().toLowerCase();
  if (site) {
    if (site === "same-origin" || site === "none") return null;
    return trustedOrigin ? null : `Sec-Fetch-Site is ${site}`;
  }

  if (!req.origin) return null; // not a browser page
  if (origin === null) return "the Origin is not an http(s) origin";
  if (trustedOrigin) return null;

  const mine = new Set<string>();
  if (req.host) mine.add(req.host.trim().toLowerCase());
  for (const h of (req.forwardedHost || "").split(",")) if (h.trim()) mine.add(h.trim().toLowerCase());
  return mine.has(origin.host.toLowerCase()) ? null : `the Origin ${origin.origin} is not this host`;
}
