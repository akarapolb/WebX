// Per-tenant content engine URLs (WEBX_ENGINE_URLS) and the media-URL rewrite
// that goes with them. Pure functions, no env access, so tests/engineUrls.test.ts
// can exercise them directly; lib/cms.ts feeds them the environment.

/** Parse WEBX_ENGINE_URLS (JSON map tenant key -> engine base URL); trailing slashes dropped. */
export function parseEngineUrls(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const m = JSON.parse(raw) as Record<string, string>;
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v).replace(/\/$/, "")]));
}

/** Engine base URL for a tenant: its WEBX_ENGINE_URLS entry, else the default engine. */
export function engineBaseFor(urls: Record<string, string>, tenant: string, fallback: string): string {
  return urls[tenant] || fallback;
}

// A media object (Strapi upload or rust-engine asset) is an object with a
// relative `url` and a `mime`. Other `url` fields (menu items, links) are site
// paths and must stay untouched.
const isMedia = (o: any): boolean =>
  !!o && typeof o === "object" && !Array.isArray(o) && typeof o.url === "string" && /^\/(?!\/)/.test(o.url) && typeof o.mime === "string";

/** Returns `data` with every relative media URL (`url`, `thumbnailUrl`, and
 *  the same in `formats`) prefixed with `base`, the engine that served it. */
export function absolutizeMedia<T>(data: T, base: string): T {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const media = isMedia(v);
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) {
      if (media && (k === "url" || k === "thumbnailUrl") && typeof x === "string" && /^\/(?!\/)/.test(x)) out[k] = base + x;
      else out[k] = walk(x);
    }
    return out;
  };
  return walk(data);
}
