// Small pure helpers behind the style panel's inputs, kept out of the component so the
// behaviour that went wrong once can be tested without rendering anything.

export type LiveParse = { action: "clear" } | { action: "set"; n: number } | { action: "wait" };

/**
 * What to do with text typed into a number field, WHILE it is being typed. A number that is
 * in range is applied straight away (the preview follows); an empty field clears the value;
 * anything else — "-", ".", or a number outside the range — waits, because it is probably on
 * its way to a valid one. Clamping on every keystroke made "150" impossible to type into a
 * field whose minimum is 25: the first "1" became 25.
 */
export function parseLive(raw: string, min: number, max: number): LiveParse {
  const t = raw.trim();
  if (t === "") return { action: "clear" };
  const n = Number(t);
  if (!Number.isFinite(n) || n < min || n > max) return { action: "wait" };
  return { action: "set", n };
}

/** The value when the editor leaves the field: empty = unset, a number is clamped into range, anything else is invalid. */
export function parseFinal(raw: string, min: number, max: number): number | undefined | "invalid" {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return "invalid";
  return Math.min(max, Math.max(min, n));
}

/**
 * A choice that is the field's default (opacity 100, a linear gradient, "cover") normally
 * clears the field, so a style stays small. In an override, though, the field being empty
 * means "inherit": picking the default must then be WRITTEN, or a hover could never go back
 * to full opacity once the main style dimmed it. `inherited` is what the field would
 * otherwise inherit (undefined when nothing).
 */
export function writeDefault<T>(value: T, defaultValue: T, inherited: unknown): T | undefined {
  return value === defaultValue && inherited === undefined ? undefined : value;
}
