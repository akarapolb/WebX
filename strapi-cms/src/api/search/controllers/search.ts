/* Hybrid Search (TOR 8) — scope ตาม tenant
   8.1 Simple: ค้นทุกเนื้อหา · 8.2 Advanced: types/date range/fileType/keywords
   8.3 Full-text: รวม contentText ที่สกัดจากไฟล์ .pdf/.docx/.xlsx
   - GET /api/search?q=&types=&from=&to=&fileType=&locale=&limit=
   - GET /api/ai/answer?q=&locale= */
function fileUrl(f: any): string { return f && f.url ? f.url : '#'; }
function extOf(f: any, fallback?: string): string {
  const e = f && f.ext ? String(f.ext).replace('.', '').toLowerCase() : '';
  return e || String(fallback || '').toLowerCase();
}

async function gather(strapi: any, tenantKey: string, locale: string) {
  const tf = { tenant: { key: tenantKey } } as any;
  const [articles, services, faqs, jobs, downloads, ebooks] = await Promise.all([
    strapi.documents('api::article.article').findMany({ locale, status: 'published', filters: tf, limit: 300 }),
    strapi.documents('api::service.service').findMany({ locale, filters: tf, fields: ['title', 'description', 'url'], limit: 300 }),
    strapi.documents('api::faq.faq').findMany({ locale, filters: tf, fields: ['question', 'answer'], limit: 300 }),
    strapi.documents('api::job.job').findMany({ locale, filters: tf, fields: ['title', 'summary', 'jobId'], limit: 300 }),
    strapi.documents('api::download.download').findMany({ filters: tf, fields: ['title', 'description', 'category', 'contentText', 'fileType', 'updatedAt'], populate: { file: true }, limit: 300 }),
    strapi.documents('api::ebook.ebook').findMany({ filters: tf, fields: ['title', 'author', 'description', 'contentText', 'year', 'updatedAt'], populate: { file: true }, limit: 300 }),
  ]);
  const items: any[] = [];
  articles.forEach((a: any) => items.push({ type: 'article', icon: 'i-doc', title: a.title, snippet: a.excerpt || '', url: a.slug ? '/article.html?slug=' + encodeURIComponent(a.slug) : '#', date: a.publishDate, fileType: '', kw: a.title + ' ' + (a.excerpt || '') + ' ' + (Array.isArray(a.tags) ? a.tags.join(' ') : '') }));
  services.forEach((s: any) => items.push({ type: 'service', icon: 'i-grid', title: s.title, snippet: s.description || '', url: s.url || '#', date: null, fileType: '', kw: s.title + ' ' + (s.description || '') }));
  faqs.forEach((f: any) => items.push({ type: 'faq', icon: 'i-chat', title: f.question, snippet: f.answer || '', url: '#', date: null, fileType: '', answer: f.answer || '', kw: f.question + ' ' + (f.answer || '') }));
  jobs.forEach((j: any) => items.push({ type: 'job', icon: 'i-users', title: j.title, snippet: j.summary || '', url: '/careers.html?id=' + j.jobId, date: null, fileType: '', kw: j.title + ' ' + (j.summary || '') }));
  downloads.forEach((d: any) => items.push({ type: 'download', icon: 'i-doc', title: d.title, snippet: d.description || '', url: fileUrl(d.file), date: d.updatedAt, fileType: extOf(d.file, d.fileType), kw: d.title + ' ' + (d.description || '') + ' ' + (d.contentText || '') }));
  ebooks.forEach((e: any) => items.push({ type: 'ebook', icon: 'i-book', title: e.title, snippet: e.description || '', url: fileUrl(e.file), date: e.updatedAt, fileType: extOf(e.file, 'pdf'), kw: e.title + ' ' + (e.author || '') + ' ' + (e.description || '') + ' ' + (e.contentText || '') }));
  return items;
}

function tokenize(q: string): string[] { return q.toLowerCase().split(/\s+/).filter(Boolean); }

function rank(items: any[], toks: string[], limit: number) {
  return items.map((it) => {
    const title = (it.title || '').toLowerCase();
    const hay = (it.kw || '').toLowerCase();
    let s = 0;
    toks.forEach((t) => { if (title.includes(t)) s += 3; else if (hay.includes(t)) s += 1; });
    return { it, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.it);
}

function snippetOf(item: any, toks: string[]): string {
  const text = String(item.kw || item.snippet || '');
  const lower = text.toLowerCase();
  let idx = -1;
  for (const t of toks) { const i = lower.indexOf(t); if (i >= 0) { idx = i; break; } }
  if (idx < 0) return String(item.snippet || text).slice(0, 180);
  const start = Math.max(0, idx - 70);
  return (start > 0 ? '…' : '') + text.slice(start, start + 200).replace(/\s+/g, ' ').trim() + '…';
}

function applyFilters(items: any[], ctx: any) {
  const types = String(ctx.query.types || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const fileType = String(ctx.query.fileType || '').toLowerCase();
  const from = ctx.query.from ? new Date(String(ctx.query.from)).getTime() : null;
  const to = ctx.query.to ? new Date(String(ctx.query.to)).getTime() + 86400000 : null;
  let out = items;
  if (types.length) out = out.filter((it) => types.includes(it.type));
  if (fileType) out = out.filter((it) => it.fileType === fileType);
  if (from || to) out = out.filter((it) => { if (!it.date) return false; const d = new Date(it.date).getTime(); if (from && d < from) return false; if (to && d > to) return false; return true; });
  return out;
}

export default {
  async search(ctx: any) {
    const q = String(ctx.query.q || '').trim();
    const locale = String(ctx.query.locale || 'th');
    const limit = Number(ctx.query.limit) || 20;
    const tenantKey = ctx.state.tenantKey || 'dga';
    const toks = tokenize(q);
    let items = applyFilters(await gather(strapi, tenantKey, locale), ctx);
    const hits = toks.length ? rank(items, toks, limit) : items.slice(0, limit);
    ctx.body = {
      data: hits.map((it) => ({ type: it.type, icon: it.icon, title: it.title, snippet: snippetOf(it, toks), url: it.url, date: it.date || null, fileType: it.fileType || null })),
      meta: { tenant: tenantKey, query: q, count: hits.length, total: items.length },
    };
  },

  async answer(ctx: any) {
    const q = String(ctx.query.q || '').trim();
    const locale = String(ctx.query.locale || 'th');
    const tenantKey = ctx.state.tenantKey || 'dga';
    const toks = tokenize(q);
    if (!toks.length) { ctx.body = { data: { answer: '', sources: [] }, meta: { tenant: tenantKey } }; return; }
    const hits = rank(await gather(strapi, tenantKey, locale), toks, 3);
    if (!hits.length) { ctx.body = { data: { answer: '', sources: [] }, meta: { tenant: tenantKey, query: q } }; return; }
    const top = hits[0];
    ctx.body = { data: { answer: top.answer || top.snippet || top.title, sources: hits.map((h) => ({ title: h.title, url: h.url, type: h.type })) }, meta: { tenant: tenantKey, query: q } };
  },
};
