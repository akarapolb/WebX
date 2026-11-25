/* Reads from the WebX control plane (webx-control) for the analytics screens (docs/target-architecture.md, tracks C3 and C5).
 *
 * Studio writes the audit log to the control plane once WEBX_CONTROL_URL and WEBX_CONTROL_SERVICE_TOKEN are set, and the
 * visitors' cookie choices go there once the public site's PUBLIC_CONTROL_URL points at it. The dashboard's "recent
 * activity", its cookie-consent numbers and the monthly report have to read them from the same place, or they would
 * freeze at the day of the switch. Give Strapi the same two variables Studio has; with either missing nothing here is
 * used and analytics reads Strapi's own tables, as before. */

export type ControlConfig = { base: string; token: string };

export function controlConfig(env: Record<string, string | undefined> = process.env): ControlConfig | null {
  const base = (env.WEBX_CONTROL_URL || '').replace(/\/$/, '');
  const token = env.WEBX_CONTROL_SERVICE_TOKEN || '';
  return base && token ? { base, token } : null;
}

async function get(cfg: ControlConfig, path: string): Promise<any> {
  const r = await fetch(cfg.base + path, { headers: { Authorization: 'Bearer ' + cfg.token } });
  if (!r.ok) throw new Error(`the control plane's ${path.split('?')[0]} answered ${r.status}`);
  return r.json();
}

/** Audit rows, newest first, for one workspace (or all), optionally inside `[from, to]` (ISO times, both inclusive). */
export async function controlAudit(cfg: ControlConfig, o: { tenantKey?: string; from?: string; to?: string; limit: number }): Promise<any[]> {
  const p = ['sort=' + encodeURIComponent('at:desc'), 'pageSize=' + o.limit];
  const filter = (f: string) => p.push('filter=' + encodeURIComponent(f));
  if (o.tenantKey) filter('tenantKey:eq:' + o.tenantKey);
  if (o.from) filter('at:gte:' + o.from);
  if (o.to) filter('at:lte:' + o.to);
  return (await get(cfg, '/internal/audit?' + p.join('&'))).data || [];
}

/** Rows of one of the control plane's record collections (a form's submissions), newest first, for one workspace (or all), up to
 * `limit`. Personal data comes back readable: the control plane decrypts what it holds. Throws when it cannot be read, so a
 * caller that must not hand out a partial answer (an export) can say so. */
export async function controlRecords(cfg: ControlConfig, collection: string, o: { tenantKey?: string; limit: number }): Promise<any[]> {
  const PAGE = 500;
  const rows: any[] = [];
  for (let page = 1; rows.length < o.limit; page++) {
    const p = ['sort=' + encodeURIComponent('createdAt:desc'), 'page=' + page, 'pageSize=' + PAGE];
    if (o.tenantKey) p.push('filter=' + encodeURIComponent('tenantKey:eq:' + o.tenantKey));
    const j = await get(cfg, `/internal/records/${encodeURIComponent(collection)}?` + p.join('&'));
    const got: any[] = j.data || [];
    rows.push(...got);
    if (got.length < PAGE || page >= (j.meta?.pagination?.pageCount ?? page)) break;
  }
  return rows.slice(0, o.limit);
}

export type FormCounts = { complaint: number; application: number; registration: number; 'contact-message': number };

/** How many submissions the control plane holds for each form, for one workspace (or all), optionally inside `[from, before)`. */
export async function controlForms(cfg: ControlConfig, o: { tenantKey?: string; from?: string; before?: string }): Promise<FormCounts> {
  const p: string[] = [];
  if (o.tenantKey) p.push('tenant=' + encodeURIComponent(o.tenantKey));
  if (o.from) p.push('from=' + encodeURIComponent(o.from));
  if (o.before) p.push('before=' + encodeURIComponent(o.before));
  const d = (await get(cfg, '/internal/forms/summary' + (p.length ? '?' + p.join('&') : ''))).data;
  return { complaint: d.complaint, application: d.application, registration: d.registration, 'contact-message': d['contact-message'] };
}

export type ConsentCounts = { total: number; accept: number; reject: number; custom: number };

/** The control plane's cookie-consent counts by kind, for one workspace (or all), optionally inside `[from, before)`. */
export async function controlConsent(cfg: ControlConfig, o: { tenantKey?: string; from?: string; before?: string }): Promise<ConsentCounts> {
  const p: string[] = [];
  if (o.tenantKey) p.push('tenant=' + encodeURIComponent(o.tenantKey));
  if (o.from) p.push('from=' + encodeURIComponent(o.from));
  if (o.before) p.push('before=' + encodeURIComponent(o.before));
  const d = (await get(cfg, '/internal/consent/summary' + (p.length ? '?' + p.join('&') : ''))).data;
  return { total: d.total, accept: d.accept, reject: d.reject, custom: d.custom };
}
