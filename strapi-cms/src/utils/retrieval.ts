/**
 * Small lexical retriever for the public `assist.ask` endpoint: Latin words plus Thai
 * character bigrams (Thai has no spaces between words), with common question/filler words
 * removed and a BM25-like score. No index or vector store needed; it ranks the few hundred
 * documents a tenant site has in a few milliseconds.
 */
export type Doc = { id: string; kind: string; title: string; text: string; url: string | null };
export type Hit = Doc & { score: number };

const THAI = /[฀-๿]+/g;
const STOP = new Set(
  'a an and are as at be by can do does for from has have how i in is it its of on or the to was what when where which who why will with'.split(' '),
);
const THAI_STOP = /(อะไร|เท่าไร|เท่าไหร่|อย่างไร|ยังไง|ที่ไหน|เมื่อไร|หรือไม่|ไหม|คือ|ของ|ได้|ที่|และ|ใน|มี|การ)/g;

export function tokens(s: string): string[] {
  const out: string[] = [];
  const lower = String(s || '').toLowerCase();
  for (const w of lower.replace(THAI, ' ').split(/[^a-z0-9.#']+/)) {
    if (w.length > 1 && !STOP.has(w)) out.push(w.replace(/\.$/, ''));
  }
  for (const run of lower.replace(THAI_STOP, ' ').match(THAI) ?? []) {
    if (run.length === 1) out.push(run);
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

export function rank(docs: Doc[], query: string, limit = 5): Hit[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const tok = docs.map((d) => tokens(d.title + ' ' + d.title + ' ' + d.text));
  const df = new Map<string, number>();
  for (const ts of tok) for (const w of new Set(ts)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  return docs
    .map((d, i) => {
      const tf = new Map<string, number>();
      for (const w of tok[i]) tf.set(w, (tf.get(w) ?? 0) + 1);
      let score = 0;
      let matched = 0;
      for (const w of q) {
        const f = tf.get(w);
        if (!f) continue;
        matched++;
        score += (f / (f + 1.2)) * Math.log(1 + N / (df.get(w) ?? 1));
      }
      // Most of the query must match, so Thai bigram noise doesn't surface weak hits.
      const cover = matched / q.length;
      // A document whose own title matches the question (an FAQ "What is the EGDI?" for the
      // question "what is the EGDI") should beat a page that merely mentions the terms.
      // Both directions count: the title covers the question, and the title is mostly the
      // question (so "What is the EGDI?" beats "Thailand's UN EGDI rank" for "what is the EGDI").
      const titleToks = new Set(tokens(d.title));
      const shared = q.filter((w) => titleToks.has(w)).length;
      const titleCover = shared / q.length;
      const titlePrecision = titleToks.size ? shared / titleToks.size : 0;
      return { ...d, score: cover >= 0.5 ? score * cover * (1 + 3 * titleCover * titlePrecision) : 0 };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Plain text from Strapi rich text / HTML / markdown. */
export function plain(s: unknown): string {
  return String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>`|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
