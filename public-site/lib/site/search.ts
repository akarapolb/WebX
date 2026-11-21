// WebX site kit — searching the static index in the browser (no server).
// Thai has no spaces between words, so matching is by substring: every word of
// the query must appear in the entry; title matches rank first. Pure functions,
// shared by components/site/useStaticSearch.ts and the tests.

/** u: link, t: title, s: section (page the entry belongs to), x: searchable text. */
export type SearchDoc = { u: string; t: string; s: string; x: string };

export const norm = (s: string) => s.normalize("NFC").toLowerCase();
export const queryTerms = (q: string) => norm(q).split(/\s+/).filter(Boolean);

export function scoreDoc(d: SearchDoc, terms: string[]): number {
  const t = norm(d.t), x = norm(d.x);
  let total = 0;
  for (const term of terms) {
    const inTitle = t.includes(term);
    const inText = x.includes(term);
    if (!inTitle && !inText) return 0;
    total += (inTitle ? 10 : 0) + Math.min(x.split(term).length - 1, 5);
  }
  return total;
}

export function searchDocs(docs: SearchDoc[], terms: string[], limit = 50) {
  if (!terms.length) return [];
  return docs.map((d) => ({ d, s: scoreDoc(d, terms) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);
}

/** A short passage around the first match, split into [text, match, text, …]
 *  (odd indexes are matches), with ellipses where the text was cut. */
export function snippetParts(text: string, terms: string[]): { parts: string[]; before: boolean; after: boolean } {
  const low = norm(text);
  const first = Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0));
  if (!isFinite(first)) return { parts: [text.slice(0, 180)], before: false, after: text.length > 180 };
  const start = Math.max(0, first - 70);
  const end = Math.min(text.length, first + 150);
  const re = new RegExp("(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
  return { parts: text.slice(start, end).split(re), before: start > 0, after: end < text.length };
}
