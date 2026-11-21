/**
 * search-stat — public site search analytics.
 *  POST /api/search-stats/log?tenant=<key>  { q, locale, results }   (public, rate-limited)
 * Studio reads the rows through the admin content API (tenant-scoped by the
 * tenant middleware, see SCOPED in src/index.ts). There are no public read routes.
 */
export default {
  routes: [
    { method: 'POST', path: '/search-stats/log', handler: 'search-stat.log', config: { auth: false } },
  ],
};
