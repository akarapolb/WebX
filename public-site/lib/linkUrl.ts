// The address an item's card opens, set per entry in WordPress (the `link_url` field). It comes from an editor
// (or a file import or the agent), so it is checked before it reaches an <a href>: only http(s) addresses, mailto:,
// tel:, and paths or anchors on this site. `javascript:`, `data:` and the like never pass.

const MAX_LEN = 2000;
// Spaces, control characters and the characters that could break out of an attribute.
const UNSAFE_CHARS = /[\s\u0000-\u001f\u007f<>"'`\\]/;

/** The cleaned address, or null when it is empty or not a safe link. */
export function safeLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > MAX_LEN || UNSAFE_CHARS.test(s)) return null;
  if (/^https?:\/\/[^/?#]+/i.test(s)) return s;
  if (/^(mailto|tel):./i.test(s)) return s;
  if (s.startsWith("#")) return s;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  return null;
}

/** Where a card for this entry goes: its own `link_url` when set and safe, otherwise `fallback`. */
export function entryLink(e: { acf?: Record<string, any> } | null | undefined, fallback = "#"): string {
  return safeLink(e?.acf?.link_url) ?? fallback;
}
