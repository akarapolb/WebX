/**
 * search-stat controller — counts a visitor's search (aggregated, anonymous).
 * Stored per tenant + language + normalised query: how often, how many results
 * the last time, how often it found nothing. Never stores who searched (no IP,
 * user agent, cookie or path), and drops queries that look like personal data
 * (an email address, a phone/ID number) instead of storing them.
 */
import { factories } from '@strapi/strapi';
import { normaliseQuery } from '../../../utils/search-query';

const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 30, WINDOW = 60_000; // 30 searches / minute / IP (IP held in memory only)

export default factories.createCoreController('api::search-stat.search-stat', ({ strapi }) => ({
  async log(ctx: any) {
    const ip = String(ctx.request.ip || ctx.request.header?.['x-forwarded-for'] || '?');
    const now = Date.now();
    const rec = hits.get(ip);
    if (rec && now - rec.t < WINDOW) {
      if (rec.n >= LIMIT) { ctx.status = 429; ctx.body = { error: 'Too many requests' }; return; }
      rec.n++;
    } else hits.set(ip, { n: 1, t: now });

    // a tenant key nobody has is a 404, as in webx-control (decision D9); never counted under another tenant
    if (ctx.state?.tenantUnknown) { ctx.status = 404; ctx.body = { error: 'unknown tenant' }; return; }
    const tenantId = ctx.state?.tenantId;
    if (!tenantId) { ctx.status = 400; ctx.body = { error: 'tenant required' }; return; }
    const b = ctx.request.body || {};
    const query = normaliseQuery(b.q);
    if (!query) { ctx.status = 204; return; } // empty or looked like personal data: not stored
    const locale = b.locale === 'en' ? 'en' : 'th';
    const results = Math.max(0, Math.min(10_000, Math.floor(Number(b.results) || 0)));

    const db = strapi.db.query('api::search-stat.search-stat');
    const row: any = await db.findOne({ where: { query, locale, tenant: { id: tenantId } } });
    if (row) {
      await db.update({ where: { id: row.id }, data: { count: (row.count || 0) + 1, results, zeroCount: (row.zeroCount || 0) + (results ? 0 : 1), lastAt: new Date() } });
    } else {
      await strapi.documents('api::search-stat.search-stat').create({ data: { query, locale, results, count: 1, zeroCount: results ? 0 : 1, lastAt: new Date(), tenant: tenantId } as any });
    }
    ctx.status = 204;
  },
}));
