/**
 * assist controller — public, rate-limited, LLM-agnostic (LiteLLM).
 *  - simplify : rewrite จากภาษาราชการ -> ภาษาที่ประชาชนเข้าใจง่าย
 *  - translate: แปลข้อความเป็นภาษาที่เลือก (on-demand)
 *  - find     : AI service finder (AEO) — ตอบจากบริการ/FAQ ของ tenant พร้อมขั้นตอน
 *  - ask      : site assistant (TH/EN) — answers from the tenant's own published pages,
 *               articles, FAQs, services and datasets, and always returns the sources it
 *               used. Works without an LLM too (returns the best-matching passage).
 */
import { rank, plain, type Doc } from '../../../utils/retrieval';
const LITELLM = (process.env.LITELLM_URL || '').replace(/\/$/, '');
const LKEY = process.env.LITELLM_KEY || '';
const MODEL = process.env.LITELLM_MODEL || 'webx-default';
const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 20, WINDOW = 60_000; // 20 req / min / IP

function limited(ip: string): boolean {
  const now = Date.now(); const rec = hits.get(ip);
  if (rec && now - rec.t < WINDOW) { if (rec.n >= LIMIT) return true; rec.n++; return false; }
  hits.set(ip, { n: 1, t: now }); return false;
}
async function llm(system: string, prompt: string, maxTokens = 700): Promise<string> {
  const r = await fetch(LITELLM + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(LKEY ? { Authorization: 'Bearer ' + LKEY } : {}) },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.4 }),
  });
  if (!r.ok) throw new Error('llm ' + r.status);
  const j: any = await r.json();
  return j?.choices?.[0]?.message?.content || '';
}
const ipOf = (ctx: any) => String(ctx.request.ip || ctx.request.header?.['x-forwarded-for'] || '?');
const gate = (ctx: any): boolean => {
  if (!LITELLM) { ctx.status = 503; ctx.body = { error: 'AI not configured' }; return false; }
  if (limited(ipOf(ctx))) { ctx.status = 429; ctx.body = { error: 'Too many requests' }; return false; }
  return true;
};

/** Public URL of a tenant page on public-site (gov-portal routes: dga at "/", others at "/<key>", EN under "/en"). */
function siteBase(tenantKey: string, locale: string): string {
  const b = (locale === 'en' ? '/en' : '') + (tenantKey && tenantKey !== 'dga' ? '/' + tenantKey : '');
  return b || '/';
}
const join = (base: string, slug: string) => (base === '/' ? '' : base) + '/' + slug;

/** Everything the ask endpoint may answer from: published, this tenant, this locale. */
async function siteCorpus(strapi: any, tenantKey: string, locale: string): Promise<Doc[]> {
  const tf: any = { tenant: { key: tenantKey } };
  const opt = { locale, status: 'published', filters: tf, limit: 200 };
  const safe = (p: Promise<any[]>) => p.catch(() => [] as any[]);
  const [pages, services, faqs, articles, datasets] = await Promise.all([
    safe(strapi.documents('api::page.page').findMany({ ...opt, populate: { blocks: { populate: '*' } } })),
    safe(strapi.documents('api::service.service').findMany({ ...opt, fields: ['title', 'description', 'url'] })),
    safe(strapi.documents('api::faq.faq').findMany({ ...opt, fields: ['question', 'answer', 'order'] })),
    safe(strapi.documents('api::article.article').findMany({ ...opt, fields: ['title', 'excerpt', 'body', 'slug', 'publishDate'] })),
    safe(strapi.documents('api::dataset.dataset').findMany({ ...opt, fields: ['key', 'title', 'description', 'sourceName', 'rows', 'fields'] })),
  ]);
  const base = siteBase(tenantKey, locale);
  const pageUrl = (p: any) => (p.slug === 'home-blocks' ? base : join(base, p.slug));
  // Where on the site each kind of item is shown: the first page carrying the matching block.
  const pageWith = (pred: (b: any) => boolean) => {
    const p = pages.find((pg: any) => (pg.blocks || []).some(pred));
    return p ? pageUrl(p) : null;
  };
  const faqUrl = pageWith((b) => b.__component === 'block.faq');
  const newsUrl = pageWith((b) => b.__component === 'block.news-panel');
  const docs: Doc[] = [];
  for (const p of pages) {
    for (const [i, b] of (p.blocks || []).entries()) {
      // Each tab/accordion panel is its own citable passage (one per index, law, term…).
      if (b.__component === 'block.tabs' && Array.isArray(b.items)) {
        b.items.forEach((it: any, j: number) => {
          const text = plain(it.body);
          if (it.title && text) docs.push({ id: 'page-' + p.documentId + '-' + i + '-' + j, kind: 'page', title: it.title, text, url: pageUrl(p) });
        });
        continue;
      }
      const text = plain([b.title, b.eyebrow, b.intro, b.subtitle, b.body, b.text, b.description,
        ...(Array.isArray(b.items) ? b.items.map((x: any) => [x.title, x.label, x.value, x.description, x.body].join(' ')) : []),
        ...(Array.isArray(b.tabs) ? b.tabs.map((x: any) => [x.title, x.body].join(' ')) : [])].filter(Boolean).join(' '));
      if (text.length > 20) docs.push({ id: 'page-' + p.documentId + '-' + i, kind: 'page', title: b.title || p.title, text, url: pageUrl(p) });
    }
  }
  for (const s of services) docs.push({ id: 'svc-' + s.documentId, kind: 'service', title: s.title, text: plain(s.description), url: s.url || null });
  for (const f of faqs) docs.push({ id: 'faq-' + f.documentId, kind: 'faq', title: f.question, text: plain(f.answer), url: faqUrl });
  for (const a of articles) docs.push({ id: 'art-' + a.documentId, kind: 'article', title: a.title, text: plain([a.excerpt, a.body].join(' ')).slice(0, 1500), url: newsUrl });
  for (const d of datasets) {
    const rows: any[] = Array.isArray(d.rows) ? d.rows : [];
    // A compact, quotable digest of the records, so "what was Thailand's rank in 2022" can be answered.
    const digest = rows.slice(0, 120).map((r) => Object.values(r).join(' ')).join('; ');
    docs.push({
      id: 'ds-' + d.documentId, kind: 'dataset', title: d.title,
      text: plain([d.description, d.sourceName].join(' ')) + ' ' + digest,
      url: pageWith((b) => b.__component === 'block.chart' && b.datasetKey === d.key)
        || pageWith((b) => b.__component === 'block.dataset-download'),
    });
  }
  return docs;
}

export default {
  async ask(ctx: any) {
    if (limited(ipOf(ctx))) { ctx.status = 429; ctx.body = { error: 'Too many requests' }; return; }
    const body = ctx.request.body || {};
    const q = String(body.q || '').trim().slice(0, 400);
    const locale = body.locale === 'en' ? 'en' : 'th';
    const tenantKey = ctx.state?.tenantKey || '';
    if (!q) { ctx.status = 400; ctx.body = { error: 'q required' }; return; }
    if (!tenantKey) { ctx.status = 400; ctx.body = { error: 'tenant required' }; return; }
    const hits = rank(await siteCorpus((global as any).strapi, tenantKey, locale), q, 5);
    const sources = hits.map((h, i) => ({ n: i + 1, kind: h.kind, title: h.title, url: h.url }));
    if (!hits.length) {
      ctx.body = { answer: null, mode: 'none', sources: [] };
      return;
    }
    if (LITELLM) {
      const ctxText = hits.map((h, i) => '[' + (i + 1) + '] ' + h.title + '\n' + h.text.slice(0, 1200)).join('\n\n');
      const system = locale === 'en'
        ? 'You answer questions about this government website using ONLY the numbered sources given. Cite sources inline as [1], [2]. If the sources do not contain the answer, say so plainly. Never invent figures. Answer in English, concisely.'
        : 'คุณตอบคำถามเกี่ยวกับเว็บไซต์ภาครัฐนี้ โดยใช้ "แหล่งข้อมูลที่มีหมายเลข" ที่ให้มาเท่านั้น อ้างอิงในคำตอบเป็น [1], [2] ถ้าแหล่งข้อมูลไม่มีคำตอบให้บอกตรง ๆ ห้ามแต่งตัวเลขเอง ตอบเป็นภาษาไทยอย่างกระชับ';
      try {
        const answer = await llm(system, 'Sources:\n' + ctxText + '\n\nQuestion: ' + q, 600);
        ctx.body = { answer, mode: 'llm', sources };
        return;
      } catch { /* fall through to extractive */ }
    }
    // No LLM (or it failed): quote the best-matching passage, never generate text.
    const top = hits[0];
    ctx.body = { answer: top.text.slice(0, 600) + (top.text.length > 600 ? '…' : ''), mode: 'extractive', sources };
  },
  async simplify(ctx: any) {
    if (!gate(ctx)) return;
    const text = String(ctx.request.body?.text || '').slice(0, 6000);
    if (!text) { ctx.status = 400; ctx.body = { error: 'text required' }; return; }
    try {
      ctx.body = { text: await llm(
        'คุณเป็นผู้ช่วยที่อธิบายเนื้อหาภาษาราชการไทยให้เป็นภาษาที่ประชาชนทั่วไปเข้าใจง่าย กระชับ ตรงประเด็น ใช้คำธรรมดา ไม่เพิ่มข้อมูลที่ไม่มีในต้นฉบับ',
        'อธิบายข้อความต่อไปนี้ให้เข้าใจง่าย:\n\n' + text) };
    } catch { ctx.status = 502; ctx.body = { error: 'AI error' }; }
  },
  async translate(ctx: any) {
    if (!gate(ctx)) return;
    const text = String(ctx.request.body?.text || '').slice(0, 6000);
    const target = String(ctx.request.body?.target || 'en').slice(0, 20);
    if (!text) { ctx.status = 400; ctx.body = { error: 'text required' }; return; }
    try {
      ctx.body = { text: await llm(
        'You are a professional translator. Translate the user text into the requested language, preserving meaning and a formal public-sector tone. Output only the translation.',
        'Translate to ' + target + ':\n\n' + text, 1200) };
    } catch { ctx.status = 502; ctx.body = { error: 'AI error' }; }
  },
  async find(ctx: any) {
    if (!gate(ctx)) return;
    const q = String(ctx.request.body?.q || ctx.query?.q || '').slice(0, 400);
    const tenantKey = ctx.state?.tenantKey || ctx.query?.tenant || '';
    if (!q) { ctx.status = 400; ctx.body = { error: 'q required' }; return; }
    const strapi = (global as any).strapi;
    const tf: any = tenantKey ? { tenant: { key: tenantKey } } : {};
    let services: any[] = [], faqs: any[] = [];
    try {
      services = await strapi.documents('api::service.service').findMany({ locale: 'th', status: 'published', filters: tf, fields: ['title', 'description', 'slug'], limit: 60 });
      faqs = await strapi.documents('api::faq.faq').findMany({ locale: 'th', status: 'published', filters: tf, fields: ['question', 'answer'], limit: 40 });
    } catch {}
    const ctxText = services.map((s, i) => '[S' + i + '] ' + s.title + ': ' + String(s.description || '').slice(0, 200)).join('\n') +
      '\n' + faqs.map((f, i) => '[Q' + i + '] ' + f.question + ' — ' + String(f.answer || '').replace(/<[^>]+>/g, ' ').slice(0, 200)).join('\n');
    try {
      const answer = await llm(
        'คุณเป็นผู้ช่วยแนะนำบริการภาครัฐ ตอบจาก "บริการและคำถามที่ให้มา" เท่านั้น บอกว่าควรใช้บริการใด และสรุปขั้นตอนสั้น ๆ เป็นข้อ ๆ ถ้าไม่มีข้อมูลให้บอกว่าไม่พบและแนะนำให้ติดต่อหน่วยงาน ตอบเป็นภาษาไทย',
        'บริการและคำถาม:\n' + ctxText + '\n\nคำถามประชาชน: ' + q, 700);
      ctx.body = { answer, services: services.slice(0, 6).map((s) => ({ title: s.title, slug: s.slug })) };
    } catch { ctx.status = 502; ctx.body = { error: 'AI error' }; }
  },
};
