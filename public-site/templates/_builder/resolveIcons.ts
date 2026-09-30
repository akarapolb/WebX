// Swap a tenant's own icon keys into a block tree before it renders.
//
// Blocks store an icon as a plain string: either a sprite symbol id
// ("i-shield") or the `key` of an Icon record the tenant added. The templates
// render icons in sixteen different places, so rather than thread the icon
// library through every block component, this rewrites the value once — a
// matched key becomes the resolved definition, and BlockIcon renders whichever
// shape it is handed.
//
// Pure and server-safe: no React, no DOM, no fetching.

export type IconDef = { svg?: string; viewBox?: string; imageUrl?: string };
export type IconLibrary = Record<string, IconDef>;

/** Keys whose value is an icon reference. */
const ICON_KEYS = new Set(["icon"]);

// Deep enough for a block's own nesting (items → tabs → items) without ever
// walking into something pathological.
const MAX_DEPTH = 8;

/**
 * A copy of `value` with every icon reference that names an entry in `library`
 * replaced by that entry. Returns the input untouched when there is nothing to
 * resolve, so the common case allocates nothing.
 */
export function resolveIcons<T>(value: T, library: IconLibrary | undefined, depth = 0): T {
  if (!library || depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const r = resolveIcons(v, library, depth + 1);
      if (r !== v) changed = true;
      return r;
    });
    return (changed ? out : value) as unknown as T;
  }
  if (!value || typeof value !== "object") return value;

  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // Only a string is a reference — an already-resolved definition, or any
    // other shape, is left exactly as it is so this stays idempotent.
    if (ICON_KEYS.has(k) && typeof v === "string" && library[v]) {
      out[k] = library[v];
      changed = true;
      continue;
    }
    const r = resolveIcons(v, library, depth + 1);
    if (r !== v) changed = true;
    out[k] = r;
  }
  return (changed ? out : value) as T;
}
