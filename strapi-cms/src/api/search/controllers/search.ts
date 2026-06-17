/**
 * Hybrid Search + AI Smart Search — ค้นจากเนื้อหา CMS (article/service/faq/job)
 * จำกัดเฉพาะ tenant ที่ middleware resolve มาแล้ว (ctx.state.tenantKey)
 * - GET /api/search?q=&locale=&limit=  → รายการผลลัพธ์จัดอันดับ
 * - GET /api/ai/answer?q=&locale=       → คำตอบสั้น + แหล่งอ้างอิง (จาก FAQ/เนื้อหา)
 */
async function gather(strapi: any, tenantKey: string, locale: string) {
  const tFilter = { tenant: { key: tenantKey } } as any;
  const [articles, services, faqs, jobs] = await Promise.all([
    strapi.documents('api::article.article').findMany({ locale, filters: tFilter, fields: ['title', 'excerpt', 'slug', 'kind'], limit: 200 }),
    strapi.documents('api::service.service').findMany({ locale, filters: tFilter, fields: ['title', 'description', 'url'], limit: 200 }),
    strapi.documents('api::faq.faq').findMany({ locale, filters: tFilter, fields: ['question', 'answer'], limit: 200 }),
    strapi.documents('api::job.job').findMany({ locale, filters: tFilter, fields: ['title', 'summary', 'jobId'], limit: 200 }),
  ]);
  const items: any[] = [];
  articles.forEach((a: any) => items.push({ type: 'article', icon: 'i-doc', title: a.title, snippet: a.excerpt || '', url: '#', kw: a.title + ' ' + (a.excerpt || '') }));
  services.forEach((s: any) => items.push({ type: 'service', icon: 'i-grid', title: s.title, snippet: s.description || '', url: s.url || '#', kw: s.title + ' ' + (s.description || '') }));
  faqs.forEach((f: any) => items.push({ type: 'faq', icon: 'i-chat', title: f.question, snippet: f.answer || '', url: '#', answer: f.answer || '', kw: f.question + ' ' + (f.answer || '') }));
  jobs.forEach((j: any) => items.push({ type: 'job', icon: 'i-users', title: j.title, snippet: j.summary || '', url: '/careers.html?id=' + j.jobId, kw: j.title + ' ' + (j.summary || '') }));
  return items;
}

function rank(items: any[], q: string, limit: number) {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  return items.map((it) => {
    const title = (it.title || '').toLowerCase();
    const hay = (it.kw || '').toLowerCase();
    let s = 0;
    toks.forEach((t) => { if (title.includes(t)) s += 3; else if (hay.includes(t)) s += 1; });
    return { it, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.it);
}

export default {
  async search(ctx: any) {
    const q = String(ctx.query.q || '').trim();
    const locale = String(ctx.query.locale || 'th');
    const limit = Number(ctx.query.limit) || 10;
    const tenantKey = ctx.state.tenantKey || 'dga';
    if (!q) { ctx.body = { data: [], meta: { tenant: tenantKey, query: q } }; return; }
    const items = await gather(strapi, tenantKey, locale);
    const hits = rank(items, q, limit).map((it) => ({ type: it.type, icon: it.icon, title: it.title, snippet: it.snippet, url: it.url }));
    ctx.body = { data: hits, meta: { tenant: tenantKey, query: q, count: hits.length } };
  },

  async answer(ctx: any) {
    const q = String(ctx.query.q || '').trim();
    const locale = String(ctx.query.locale || 'th');
    const tenantKey = ctx.state.tenantKey || 'dga';
    if (!q) { ctx.body = { data: { answer: '', sources: [] }, meta: { tenant: tenantKey } }; return; }
    const items = await gather(strapi, tenantKey, locale);
    const hits = rank(items, q, 3);
    if (!hits.length) {
      ctx.body = { data: { answer: '', sources: [] }, meta: { tenant: tenantKey, query: q } };
      return;
    }
    const top = hits[0];
    const answer = top.answer || top.snippet || top.title;
    const sources = hits.map((h) => ({ title: h.title, url: h.url, type: h.type }));
    ctx.body = { data: { answer, sources }, meta: { tenant: tenantKey, query: q } };
  },
};
