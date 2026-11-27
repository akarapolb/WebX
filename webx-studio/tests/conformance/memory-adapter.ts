// In-memory reference engine: the contract of docs/engine-contract.md
// (sections 2, 3, 4 and 8) written as plainly as possible. It exists to test
// the conformance suite itself without any CMS, and as a readable statement of
// the semantics every real engine must match. It is not a product.
import { CmsError } from "../../lib/cms/types";
import type { CmsAdapter, ContentTypeInfo, EntryList, EntryQuery, MediaAsset, MediaAssetList } from "../../lib/cms/types";

type Row = Record<string, any>;
type Version = { draft: Row; published: Row | null };
type Doc = { uid: string; documentId: string; tenant: string; id: number; versions: Map<string, Version> };
type Stored = { tenant: string; asset: MediaAsset; bytes: Uint8Array; seq: number };

export type MemoryOptions = {
  uid: string;
  pluralName: string;
  /** Fields that must be present and non-empty on create. */
  required: string[];
  locales: [string, string];
};

export function createMemoryEngine(o: MemoryOptions) {
  const docs: Doc[] = [];
  const files: Stored[] = [];
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

  function findFile(tenant: string, id: string): Stored {
    // Isolation again: another tenant's file is indistinguishable from a missing one.
    const f = files.find((x) => x.asset.documentId === id && x.tenant === tenant);
    if (!f) throw new CmsError("Not Found", 404);
    return f;
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
          if (!d.versions.has(locale)) return null; // a missing locale is an empty result, not an error
          return entry(d, locale) as T;
        },
        async create<T = any>(uid: string, data: Record<string, any>, opts?: { locale?: string }): Promise<T> {
          // Like Strapi: an incomplete draft can be saved; required fields are checked at publish.
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
          for (const r of o.required) {
            if (v.draft[r] === undefined || v.draft[r] === null || v.draft[r] === "") throw new CmsError(`publish failed: ${r} must be a string`, 400);
          }
          v.published = { ...v.draft }; // the draft is copied over the published version
        },
        async unpublish(uid: string, id: string, opts?: { locale?: string }): Promise<void> {
          const v = find(tenant, uid, id).versions.get(opts?.locale ?? defaultLocale);
          if (!v) throw new CmsError("Not Found", 404);
          v.published = null; // the draft stays
        },
      },
      media: {
        async upload(file: File): Promise<MediaAsset> {
          counter += 1;
          const documentId = `file${counter.toString().padStart(20, "0")}`;
          const asset: MediaAsset = { id: counter, documentId, url: `/uploads/${documentId}-${file.name}`, mime: file.type, name: file.name };
          files.push({ tenant, asset, bytes: new Uint8Array(await file.arrayBuffer()), seq: counter });
          return { ...asset };
        },
        async list(q = {}): Promise<MediaAssetList> {
          // newest first; the search matches name, caption, alt text and tags
          const term = (q.search ?? "").toLowerCase();
          const hit = (f: Stored) => !term || [f.asset.name, f.asset.caption, f.asset.alt, f.asset.tags].some((v) => (v ?? "").toLowerCase().includes(term));
          const rows = files.filter((f) => f.tenant === tenant && hit(f)).sort((a, b) => b.seq - a.seq);
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 30;
          return { data: rows.slice((page - 1) * pageSize, page * pageSize).map((f) => ({ ...f.asset })), total: rows.length, page, pageSize };
        },
        async update(id: string, patch: { caption?: string | null; alt?: string | null; tags?: string | null }): Promise<MediaAsset> {
          const f = findFile(tenant, id);
          for (const k of ["caption", "alt", "tags"] as const) {
            if (patch[k] === null) delete f.asset[k]; // null clears
            else if (patch[k] !== undefined) f.asset[k] = patch[k]; // a field left out stays
          }
          return { ...f.asset };
        },
        async remove(id: string): Promise<void> {
          files.splice(files.indexOf(findFile(tenant, id)), 1);
        },
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

  /** What a visitor's browser gets for an asset's url. */
  function serve(url: string): Response {
    const f = files.find((x) => x.asset.url === url);
    return f ? new Response(f.bytes, { status: 200, headers: { "Content-Type": f.asset.mime ?? "application/octet-stream" } }) : new Response(null, { status: 404 });
  }

  return { adapterFor, readPublished, serve };
}
