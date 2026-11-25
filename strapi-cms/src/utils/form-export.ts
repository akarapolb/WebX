/* The rows of the Excel export of a form (src/api/console/controllers/console.ts, TOR 17.9), from the engine's own table and from
 * the WebX control plane's, as one list. Pure, so the shapes are unit-tested: see tests/form-export.test.ts. */

/** The collection the control plane keeps each export type in. */
export const CONTROL_COLLECTION: Record<string, string> = {
  application: 'application',
  complaint: 'complaint',
  registration: 'registration',
  contact: 'contact-message',
};

/** A row of Strapi's own table, as the sheet shows it: no ids, no relation, no editing bookkeeping, no steps. */
export function engineRow(r: any): any {
  const o: any = { ...r };
  delete o.id; delete o.documentId; delete o.tenant; delete o.createdById; delete o.updatedById; delete o.locale;
  if (o.steps) o.steps = undefined;
  return o;
}

/** A row of the control plane's, as the sheet shows it: the same columns, and a file by its name. */
export function controlRow(r: any): any {
  const o: any = { ...r };
  delete o.id; delete o.documentId; delete o.tenantKey; delete o.steps;
  for (const f of ['attachment', 'resume']) {
    if (o[f] && typeof o[f] === 'object') o[f] = o[f].name || undefined;
  }
  return o;
}

const at = (r: any) => { const t = new Date(r?.createdAt).getTime(); return Number.isFinite(t) ? t : 0; };

/** Both sources in one list, newest first (what the engine's table alone gave, with the control plane's rows in their place in time). */
export function mergeExportRows(engine: any[], control: any[]): any[] {
  return [...engine.map(engineRow), ...control.map(controlRow)].sort((a, b) => at(b) - at(a));
}
