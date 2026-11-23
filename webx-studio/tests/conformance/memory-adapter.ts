// In-memory reference engine: the contract of docs/engine-contract.md
// (sections 2, 3, 4 and 8) written as plainly as possible. It exists to test
// the conformance suite itself without any CMS, and as a readable statement of
// the semantics every real engine must match. It is not a product.
import { CmsError } from "../../lib/cms/types";
import type { CmsAdapter, ContentTypeInfo, EntryList, EntryQuery } from "../../lib/cms/types";

type Row = Record<string, any>;
type Version = { draft: Row; published: Row | null };
type Doc = { uid: string; documentId: string; tenant: string; id: number; versions: Map<string, Version> };

export type MemoryOptions = {
  uid: string;
  pluralName: string;
  /** Fields that must be present and non-empty on create. */
  required: string[];
  locales: [string, string];
};

export function createMemoryEngine(o: MemoryOptions) {
  const docs: Doc[] = [];
  let counter = 0;
  const defaultLocale = o.locales[0];

  const notModelled = (what: string) => async (): Promise<never> => {
    throw new CmsError(`${what} is not modelled by the in-memory engine`, 501);
  };

  function entry(d: Doc, locale: string): Row {
    const v = d.versions.get(locale)!;
    return { id: d.id, documentId: d.documentId, locale, ...v.draft };
  }

  function find(tenant: string, uid: string, documentId: string): Doc {
    // Isolation: another tenant's row is indistinguishable from a missing one.
    const d = docs.find((x) => x.uid === uid && x.documentId === documentId && x.tenant === tenant);
    if (!d) throw new CmsError("Not Found", 404);
    return d;
  }

  function matches(row: Row, f: NonNullable<EntryQuery["filter"]>[number]): boolean {
    const v = row[f.field];
    switch (f.op) {
      case "eq": return String(v) === String(f.value);
      case "ne": return String(v) !== String(f.value);
      case "contains": return String(v ?? "").toLowerCase().includes(String(f.value).toLowerCase());
      case "gte": return v >= f.value;
      case "lte": return v <= f.value;
    }
  }

  function adapterFor(tenant: string): CmsAdapter {
    return {
      schema: {
        async listContentTypes(): Promise<ContentTypeInfo[]> {
          const attributes: Record<string, any> = {};
          for (const r of o.required) attributes[r] = { type: "string", required: true };
          attributes.order = { type: "integer" };
          return [{ uid: o.uid, name: "FAQ", api: "faq", pluralName: o.pluralName, attributes, localized: true }];
        },
      },
      entries: {
        async list<T = any>(uid: string, q: EntryQuery = {}): Promise<EntryList<T>> {
          const locale = q.locale ?? defaultLocale;
          let rows = docs.filter((d) => d.uid === uid && d.tenant === tenant && d.versions.has(locale)).map((d) => entry(d, locale));
          for (const f of q.filter ?? []) rows = rows.filter((r) => matches(r, f));
          if (q.sort) {
            const [field, dir] = q.sort.split(":");
            rows.sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (dir === "desc" ? -1 : 1));
          }
          const size = q.pageSize ?? 25;
          const page = q.page ?? 1;
          return { data: rows.slice((page - 1) * size, page * size) as T[], total: rows.length, pageCount: Math.max(1, Math.ceil(rows.length / size)) };
        },
        async get<T = any>(uid: string, id: string, opts?: { locale?: string }): Promise<T | null> {
          const d = find(tenant, uid, id);
          const locale = opts?.locale ?? defaultLocale;
          if (!d.versions.has(locale)) throw new CmsError("Not Found", 404);
          return entry(d, locale) as T;
        },
        async create<T = any>(uid: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T> {
          for (const r of o.required) {
            if (data[r] === undefined || data[r] === null || data[r] === "") throw new CmsError(`create failed: ${r} must be a string`, 400);
          }
          counter += 1;
          const locale = opts?.locale ?? defaultLocale;
          const d: Doc = { uid, documentId: `doc${counter.toString().padStart(20, "0")}`, tenant, id: counter, versions: new Map() };
          d.versions.set(locale, { draft: { ...data }, published: null });
          docs.push(d);
          return entry(d, locale) as T;
        },
        async update<T = any>(uid: string, id: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T> {
          const d = find(tenant, uid, id);
          const locale = opts?.locale ?? defaultLocale;
          const v = d.versions.get(locale);
          if (v) v.draft = { ...v.draft, ...data }; // editing changes the draft only
          else d.versions.set(locale, { draft: { ...data }, published: null }); // update also creates a missing locale
          return entry(d, locale) as T;
        },
        async remove(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
          const d = find(tenant, uid, id);
          if (opts?.locale) {
            if (!d.versions.delete(opts.locale)) throw new CmsError("Not Found", 404);
            if (d.versions.size) return;
          }
          docs.splice(docs.indexOf(d), 1);
        },
      },
      publish: {
        async publish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
          const v = find(tenant, uid, id).versions.get(opts?.locale ?? defaultLocale);
          if (!v) throw new CmsError("Not Found", 404);
          v.published = { ...v.draft }; // the draft is copied over the published version
        },
        async unpublish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
          const v = find(tenant, uid, id).versions.get(opts?.locale ?? defaultLocale);
          if (!v) throw new CmsError("Not Found", 404);
          v.published = null; // the draft stays
        },
      },
      media: {
        upload: notModelled("media.upload"), list: notModelled("media.list"),
        update: notModelled("media.update"), remove: notModelled("media.remove"),
      },
      auth: {
        me: async () => null,
        listRoles: notModelled("auth.listRoles"), listUsers: notModelled("auth.listUsers"),
        findUserByEmail: notModelled("auth.findUserByEmail"), create: notModelled("auth.create"), remove: notModelled("auth.remove"),
      },
    } as CmsAdapter;
  }

  /** The read API (contract section 6): published rows of one tenant and locale. */
  function readPublished(tenant: string, uid: string, locale: string, field: string, prefix: string): Row[] {
    return docs
      .filter((d) => d.uid === uid && d.tenant === tenant)
      .flatMap((d) => {
        const v = d.versions.get(locale);
        return v?.published && String(v.published[field] ?? "").startsWith(prefix)
          ? [{ id: d.id, documentId: d.documentId, locale, ...v.published }]
          : [];
      });
  }

  return { adapterFor, readPublished };
}
