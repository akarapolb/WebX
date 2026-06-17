/* seo — เสิร์ฟ /sitemap.xml, /robots.txt, /llms.txt ที่ root แบบ dynamic ต่อ tenant
   (GEO/AEO: ให้ search engine + AI crawler อ้างอิงเนื้อหาจาก CMS ได้)
   วางไว้ต้น ๆ chain (ก่อน strapi::query) */
let tcache: { at: number; list: any[] } = { at: 0, list: [] };

async function loadTenants(strapi: any): Promise<any[]> {
  const now = Date.now();
  if (now - tcache.at < 30000 && tcache.list.length) return tcache.list;
  try {
    const l = await strapi.documents('api::tenant.tenant').findMany({ filters: { active: true }, limit: 500 });
    tcache = { at: now, list: l };
    return l;
  } catch (e) { return tcache.list; }
}
function pickTenant(list: any[], host: string): any {
  const h = String(host || '').toLowerCase().split(':')[0];
  let t = list.find((x) => Array.isArray(x.domains) && x.domains.map((d: any) => String(d).toLowerCase()).includes(h));
  if (!t) t = list.find((x) => x.key === 'dga') || list[0];
  return t || null;
}
function baseUrl(t: any): string {
  const dom = (t.domains || []).find((d: string) => d.indexOf('localhost') < 0 && d.indexOf('127.') < 0);
  return dom ? 'https://' + String(dom).replace(/^www\./, '') : 'http://localhost:8080';
}
const xmlEsc = (s: string) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));
const tv = (o: any) => (o && typeof o === 'object' ? (o.th || o.en || '') : (o || ''));

export default (_config: any, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: any) => {
    const p = ctx.path || '';
    if (ctx.method !== 'GET' || (p !== '/sitemap.xml' && p !== '/robots.txt' && p !== '/llms.txt')) return next();

    const list = await loadTenants(strapi);
    const t = list.length ? pickTenant(list, ctx.headers.host) : null;
    if (!t) return next();
    const base = baseUrl(t);
    const tf = { tenant: { key: t.key } };

    if (p === '/robots.txt') {
      ctx.type = 'text/plain';
      ctx.body = [
        'User-agent: *', 'Allow: /', '',
        '# AI / GEO crawlers',
        'User-agent: GPTBot', 'Allow: /',
        'User-agent: ClaudeBot', 'Allow: /',
        'User-agent: PerplexityBot', 'Allow: /',
        'User-agent: Google-Extended', 'Allow: /', '',
        'Sitemap: ' + base + '/sitemap.xml',
      ].join('\n');
      return;
    }

    if (p === '/sitemap.xml') {
      const jobs = await strapi.documents('api::job.job').findMany({ locale: 'th', filters: tf, fields: ['jobId'], limit: 500 });
      const statics = ['/', '/careers.html', '/complaint.html', '/register.html', '/application-status.html'];
      const urls = statics.map((u) => base + u).concat(jobs.map((j: any) => base + '/job.html?id=' + encodeURIComponent(j.jobId)));
      const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map((u: string) => '  <url><loc>' + xmlEsc(u) + '</loc><changefreq>weekly</changefreq></url>').join('\n') +
        '\n</urlset>\n';
      ctx.type = 'application/xml';
      ctx.body = body;
      return;
    }

    if (p === '/llms.txt') {
      const services = await strapi.documents('api::service.service').findMany({ locale: 'th', filters: tf, fields: ['title', 'description'], sort: 'order:asc', limit: 50 });
      const faqs = await strapi.documents('api::faq.faq').findMany({ locale: 'th', filters: tf, fields: ['question', 'answer'], sort: 'order:asc', limit: 20 });
      const org = t.brand && t.brand.orgName ? tv(t.brand.orgName) : t.name;
      const phone = t.contact && t.contact.phone ? t.contact.phone : '';
      const lines = [
        '# ' + org, '', '> ' + (t.name || ''), '',
        '## บริการสำคัญ',
        ...services.map((s: any) => '- ' + s.title + (s.description ? ': ' + s.description : '')),
        '', '## หน้าเว็บหลัก',
        '- [หน้าแรก](' + base + '/)',
        '- [ร่วมงานกับเรา](' + base + '/careers.html)',
        '- [รับเรื่องร้องเรียน](' + base + '/complaint.html)',
        '- [ลงทะเบียนผู้ใช้งาน](' + base + '/register.html)',
        '', '## คำถามที่พบบ่อย',
        ...faqs.map((f: any) => '- ' + f.question + ' — ' + String(f.answer || '').slice(0, 120)),
        '', '## ติดต่อ', phone ? '- โทร ' + phone : '',
      ];
      ctx.type = 'text/plain; charset=utf-8';
      ctx.body = lines.join('\n');
      return;
    }
    return next();
  };
};
