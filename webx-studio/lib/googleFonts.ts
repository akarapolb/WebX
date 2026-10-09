// The Google Fonts catalogue the Theme tab's font picker searches.
//
// Source: Google's own catalogue (https://fonts.google.com/metadata/fonts) — the
// list fonts.google.com itself is built from, so every family in it is one the
// CSS API the site-builder downloads from actually serves. It carries category,
// subsets, weights and a popularity rank, and needs no API key. If that is
// unreachable, Fontsource's public list (https://api.fontsource.org/v1/fonts) is
// used instead (it can contain a few families Google has since removed — those
// just fall back to the default font at build time). Either is read SERVER-side
// and cached, then handed to the browser in a compact form, so the picker works
// with one request and the admin's browser never calls either source itself.
//
// Only families are listed here. The font FILES that end up on the public site
// are downloaded by the site-builder at build time (public-site/scripts/
// google-fonts.mjs), straight from Google, and served from the site's own
// origin — visitors never contact Google.

export type CatalogFont = {
  /** Family name, exactly as Google spells it. */
  f: string;
  /** sans-serif | serif | display | handwriting | monospace */
  c: string;
  /** 1 when the family ships a Thai subset — the only ones that draw Thai text themselves. */
  t: 0 | 1;
  /** Weights the family offers. */
  w: number[];
};

// Keep in sync with public-site/lib/theme.ts (FAMILY_RE) — the site refuses any other name.
export const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,40}$/;
export const GOOGLE_PREFIX = "google:";

export const googleKey = (family: string) => GOOGLE_PREFIX + family;
export function googleFamilyOf(key: unknown): string | null {
  if (typeof key !== "string" || !key.startsWith(GOOGLE_PREFIX)) return null;
  const family = key.slice(GOOGLE_PREFIX.length);
  return FAMILY_RE.test(family) ? family : null;
}

const CATEGORIES = new Set(["sans-serif", "serif", "display", "handwriting", "monospace"]);

/** Reduce Fontsource's list to what the picker needs. Anything unexpected is dropped, not trusted. */
export function compactCatalog(raw: unknown): CatalogFont[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogFont[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object" || (e as any).type !== "google") continue;
    const family = (e as any).family;
    const category = (e as any).category;
    if (typeof family !== "string" || !FAMILY_RE.test(family) || !CATEGORIES.has(category)) continue;
    const subsets: string[] = Array.isArray((e as any).subsets) ? (e as any).subsets : [];
    const weights: number[] = Array.isArray((e as any).weights) ? (e as any).weights.filter((w: unknown) => typeof w === "number") : [];
    out.push({ f: family, c: category, t: subsets.includes("thai") ? 1 : 0, w: weights });
  }
  // Thai-capable first (the ones a Thai site can actually use), then A–Z.
  return out.sort((a, b) => b.t - a.t || a.f.localeCompare(b.f));
}

const GOOGLE_SOURCE = "https://fonts.google.com/metadata/fonts";
const FONTSOURCE_SOURCE = "https://api.fontsource.org/v1/fonts";

const GOOGLE_CATEGORIES: Record<string, string> = {
  "Sans Serif": "sans-serif", Serif: "serif", Display: "display", Handwriting: "handwriting", Monospace: "monospace",
};

/** Reduce Google's metadata to what the picker needs. Thai-capable first, then by popularity (rank 1 = most used). */
export function compactGoogleMetadata(raw: unknown): CatalogFont[] {
  const list = (raw as any)?.familyMetadataList;
  if (!Array.isArray(list)) return [];
  const rows: { font: CatalogFont; rank: number }[] = [];
  for (const e of list) {
    const family = e?.family;
    const category = GOOGLE_CATEGORIES[e?.category];
    if (typeof family !== "string" || !FAMILY_RE.test(family) || !category) continue;
    const subsets: string[] = Array.isArray(e.subsets) ? e.subsets : [];
    // Keys look like "400" or "400i"; the stylesheet only uses upright faces.
    const weights = Object.keys(e.fonts && typeof e.fonts === "object" ? e.fonts : {}).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    rows.push({ font: { f: family, c: category, t: subsets.includes("thai") ? 1 : 0, w: weights }, rank: typeof e.popularity === "number" ? e.popularity : 1e9 });
  }
  return rows.sort((a, b) => b.font.t - a.font.t || a.rank - b.rank || a.font.f.localeCompare(b.font.f)).map((r) => r.font);
}
const TTL_MS = 24 * 60 * 60 * 1000;
let cache: { at: number; fonts: CatalogFont[] } | null = null;

async function fromGoogle(fetchImpl: typeof fetch): Promise<CatalogFont[]> {
  const r = await fetchImpl(GOOGLE_SOURCE, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error("Google font catalogue answered " + r.status);
  // The response starts with an anti-JSON-hijacking prefix: )]}'
  return compactGoogleMetadata(JSON.parse((await r.text()).replace(/^\)\]\}'\s*/, "")));
}

async function fromFontsource(fetchImpl: typeof fetch): Promise<CatalogFont[]> {
  const r = await fetchImpl(FONTSOURCE_SOURCE, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error("font catalogue answered " + r.status);
  return compactCatalog(await r.json());
}

/** The catalogue, cached in memory for a day. Throws when it has never been fetched and no source is reachable. */
export async function getGoogleFontCatalog(fetchImpl: typeof fetch = fetch): Promise<CatalogFont[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.fonts;
  let lastError: unknown = new Error("font catalogue was empty");
  for (const source of [fromGoogle, fromFontsource]) {
    try {
      const fonts = await source(fetchImpl);
      if (!fonts.length) throw new Error("font catalogue was empty");
      cache = { at: Date.now(), fonts };
      return fonts;
    } catch (e) { lastError = e; }
  }
  // A stale list beats no list when both sources have a bad moment.
  if (cache) return cache.fonts;
  throw lastError;
}

/** For tests. */
export function resetCatalogCache() { cache = null; }

// ---------------------------------------------------------------------------
// "I typed the name of a font that isn't here" → what to use instead.
//
// Calibri, Times New Roman, Arial, Cambria, Georgia and Courier New are
// Microsoft fonts: they are not in Google's public catalogue and the site cannot
// host them. Each has a free, metric-compatible twin in the catalogue (same
// character widths, so text wraps at the same places). "similar" entries have no
// exact twin — they are look-alikes, and the UI says so.
// ---------------------------------------------------------------------------
export type FontAlias = { names: string[]; kind: "metric" | "similar"; families: string[] };

export const FONT_ALIASES: FontAlias[] = [
  { names: ["calibri"], kind: "metric", families: ["Carlito"] },
  { names: ["times new roman", "times"], kind: "metric", families: ["Tinos"] },
  { names: ["arial", "helvetica"], kind: "metric", families: ["Arimo"] },
  { names: ["courier new", "courier"], kind: "metric", families: ["Cousine"] },
  { names: ["cambria"], kind: "metric", families: ["Caladea"] },
  { names: ["georgia"], kind: "metric", families: ["Gelasio"] },
  { names: ["comic sans", "comic sans ms"], kind: "similar", families: ["Comic Neue"] },
  { names: ["th sarabun new", "th sarabun psk", "th sarabun", "thsarabun", "sarabun new"], kind: "similar", families: ["Sarabun"] },
  { names: ["angsana new", "angsana upc", "angsana"], kind: "similar", families: ["Trirong", "Taviraj", "Pridi", "Maitree", "Noto Serif Thai"] },
];

export type FontSuggestion = { typed: string; kind: FontAlias["kind"]; families: string[] };

/** The substitute(s) for a font name the admin typed, or null. Matches while typing (3+ characters). */
export function fontSuggestion(query: string, available?: Set<string>): FontSuggestion | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (q.length < 3) return null;
  for (const a of FONT_ALIASES) {
    const hit = a.names.find((n) => n.includes(q));
    if (!hit) continue;
    const families = available ? a.families.filter((f) => available.has(f)) : a.families;
    if (!families.length) continue;
    // Show the name the way the admin would write it, not the lower-cased key.
    const typed = hit.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Th /, "TH ");
    return { typed, kind: a.kind, families };
  }
  return null;
}
