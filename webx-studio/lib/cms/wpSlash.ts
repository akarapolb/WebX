// WordPress's REST layer hands ACF field values to code that expects them SLASHED —
// the way $_POST arrives — and removes one level of backslashes before storing them.
// Sent as they are, a value loses every backslash: JSON that carries a double quote
// (`"a \"b\" c"`) is stored as `"a "b" c"`, which is no longer JSON, and a page whose
// layout is that string turns into an empty page; newlines (`\n`) and tabs lose their
// backslash too and become the letters n and t.
//
// This is WordPress's own wp_slash(): a backslash is put in front of every backslash,
// double quote, single quote and NUL, and the REST layer's removal then restores the
// original. Applied to every string that is going to an ACF field, so what is stored is
// exactly what the editor typed.

const BACKSLASH = String.fromCharCode(92);

export function wpSlash<T>(value: T): T {
  if (typeof value === "string") {
    let out = "";
    for (const ch of value) {
      if (ch === BACKSLASH) out += BACKSLASH + BACKSLASH;
      else if (ch === '"' || ch === "'") out += BACKSLASH + ch;
      else if (ch === "\u0000") out += BACKSLASH + "0";
      else out += ch;
    }
    return out as unknown as T;
  }
  if (Array.isArray(value)) return value.map((v) => wpSlash(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object)) out[k] = wpSlash((value as any)[k]);
    return out as T;
  }
  return value;
}
