// Search insights read what visitors search for from two places while the public site moves from the content engine to
// the control plane (docs/target-architecture.md, track C5): the counts the engine already holds, and the counts
// webx-control's POST /api/search-stats/log has taken since. A query can be in both, so unlike the consent log (a list of
// events) these are added up per workspace, language and query: counts are summed, and the newer row's result count and time
// win. Nothing is copied between the two sources.
//
// No "server-only" import: it is plain code, so tests can load it.
import type { EntryList, EntryQuery } from "./types";
import { compare, firstRows, type ListFn } from "./consent-merge";

type Row = Record<string, any>;

/** How many rows of each source (its most searched, or whatever the sort is) are read and added up. Past it the long tail of
 * rarely typed queries is left out, which a "top searches" view does not miss. */
export const READ_DEPTH = 1000;

/** The filters the control plane's search statistics understand; the engine's `tenant.key` is replaced by the workspace key. */
export function controlStatQuery(query: EntryQuery | undefined, tenantKey: string | null): EntryQuery {
  const filter = (query?.filter || []).filter((f) => (f.field === "locale" && f.op === "eq") || (f.field === "query" && f.op === "contains"));
  if (tenantKey) filter.push({ field: "tenantKey", op: "eq", value: tenantKey });
  return { ...query, filter };
}

/** The workspace the engine's list is narrowed to by a `tenant.key eq` filter, if the caller sent one. */
export function tenantKeyOf(query: EntryQuery | undefined): string | null {
  const f = (query?.filter || []).find((x) => x.field === "tenant.key" && x.op === "eq");
  return f ? String(f.value) : null;
}

/** One list of per-query counts out of two sources, added up per key and cut to the requested page. `oneWorkspace` says the
 * rows are all one workspace's (the engine's rows do not say which), so the key is language and query alone. */
export async function mergedStats<T extends Row>(own: ListFn<T>, control: ListFn<T>, query: EntryQuery | undefined, oneWorkspace: boolean): Promise<EntryList<T>> {
  const page = Math.max(1, query?.page ?? 1);
  const size = Math.max(1, query?.pageSize ?? 25);
  const sort = query?.sort || "count:DESC";
  const [field, dir = "asc"] = sort.split(":");
  const sign = dir.toLowerCase() === "desc" ? -1 : 1;
  const q: EntryQuery = { ...query, sort };
  const [a, b] = await Promise.all([firstRows(own, q, READ_DEPTH), firstRows(control, q, READ_DEPTH)]);
  const merged = new Map<string, Row>();
  for (const r of [...a.rows, ...b.rows]) {
    const key = `${oneWorkspace ? "" : r.tenantKey ?? ""}|${r.locale ?? ""}|${r.query ?? ""}`;
    const cur = merged.get(key);
    if (!cur) { merged.set(key, { ...r }); continue; }
    const newer = (Date.parse(r.lastAt) || 0) > (Date.parse(cur.lastAt) || 0);
    merged.set(key, {
      ...cur,
      count: (cur.count || 0) + (r.count || 0),
      zeroCount: (cur.zeroCount || 0) + (r.zeroCount || 0),
      results: newer ? r.results : cur.results,
      lastAt: newer ? r.lastAt : cur.lastAt,
    });
  }
  const rows = [...merged.values()].sort((x, y) => sign * compare(field, x, y));
  return { data: rows.slice((page - 1) * size, page * size) as T[], total: rows.length, pageCount: Math.ceil(rows.length / size) };
}
