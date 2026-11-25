// The Cookie Consent page reads the visitors' cookie choices from two places while the public site moves from the
// content engine to the control plane (docs/target-architecture.md, track C5): the rows the engine already holds, and
// the rows webx-control's POST /api/consent-logs has taken since. Nothing is copied between them, so old evidence stays
// where it was and a deployment can switch the public site over at any moment. This merges the two lists, newest first
// (or by whatever the query sorts on), and pages the result as one.
//
// No "server-only" import: it is plain code, so tests can load it.
import type { EntryList, EntryQuery } from "./types";
import { CmsError } from "./types";

type Row = Record<string, any>;
/** One call's worth of a list, as an adapter's entries.list gives it. */
export type ListFn<T> = (q: EntryQuery) => Promise<EntryList<T>>;

/** Strapi's own list never gives more than this per page, so each source is read in chunks of it. */
const CHUNK = 100;
/** How deep a merged page may reach (page x pageSize): each source is read from its start down to there. */
export const DEEPEST = 1000;

function value(field: string, r: Row): number | string {
  const v = r[field];
  if (field === "createdAt" || field === "updatedAt") return Date.parse(v) || 0;
  return typeof v === "number" ? v : String(v ?? "");
}
export function compare(field: string, a: Row, b: Row): number {
  const x = value(field, a), y = value(field, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** The first `need` rows of a source, and its total, reading it a chunk at a time. */
export async function firstRows<T>(list: ListFn<T>, q: EntryQuery, need: number): Promise<{ rows: T[]; total: number }> {
  const rows: T[] = [];
  let total = 0;
  for (let page = 1; rows.length < need; page++) {
    const r = await list({ ...q, page, pageSize: CHUNK });
    total = r.total;
    rows.push(...r.data);
    if (r.data.length < CHUNK || rows.length >= r.total) break;
  }
  return { rows: rows.slice(0, need), total };
}

/** One list out of two sources: the same query goes to both, the rows are put in the query's sort order (newest first by
 * default) and the requested page is cut from the result. A page that would reach past DEEPEST rows is refused rather
 * than answered wrongly. */
export async function mergedList<T extends Row>(own: ListFn<T>, control: ListFn<T>, query?: EntryQuery): Promise<EntryList<T>> {
  const page = Math.max(1, query?.page ?? 1);
  const size = Math.max(1, query?.pageSize ?? 25);
  const need = page * size;
  if (need > DEEPEST) throw new CmsError(`This list is read from two places and can be paged only ${DEEPEST} rows deep: narrow it by time`, 400);
  const sort = query?.sort || "createdAt:DESC";
  const [field, dir = "asc"] = sort.split(":");
  const sign = dir.toLowerCase() === "desc" ? -1 : 1;
  const q: EntryQuery = { ...query, sort };
  const [a, b] = await Promise.all([firstRows(own, q, need), firstRows(control, q, need)]);
  const rows = [...a.rows, ...b.rows].sort((x, y) => sign * compare(field, x, y));
  const total = a.total + b.total;
  return { data: rows.slice((page - 1) * size, page * size), total, pageCount: Math.ceil(total / size) };
}

/** The filters the control plane's consent log understands; a relation filter on the engine's `tenant` has no meaning there. */
const CONTROL_FILTER_FIELDS = new Set(["createdAt", "action", "language", "path", "consentId", "userAgent"]);

/** A query for the control plane's rows: the caller's own filters on the fields it understands (a relation filter on the engine's
 * `tenant`, or a client-supplied `tenantKey`, is dropped), and the workspace by key when the caller is scoped to one. */
export function scopedControlQuery(query: EntryQuery | undefined, tenantKey: string | null, allowed: ReadonlySet<string>): EntryQuery {
  const filter = (query?.filter || []).filter((f) => allowed.has(f.field));
  if (tenantKey) filter.push({ field: "tenantKey", op: "eq", value: tenantKey });
  return { ...query, filter };
}

export function controlConsentQuery(query: EntryQuery | undefined, tenantKey: string | null): EntryQuery {
  return scopedControlQuery(query, tenantKey, CONTROL_FILTER_FIELDS);
}
