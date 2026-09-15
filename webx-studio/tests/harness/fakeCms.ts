// An in-memory CMS for tool tests (AgentCms in lib/agent/types.ts). Create and
// update check required fields and enum values the way Strapi does and fail
// with the message shape lib/cms/strapi.ts produces ("create failed: …"), so
// tool error handling runs against realistic errors. Failures can be injected.
import { CmsError, type EntryQuery } from "../../lib/cms/types";
import { digestContentType } from "../../lib/agent/schemaDigest";
import type { AgentCms } from "../../lib/agent/types";

export type FakeType = { uid: string; name: string; attributes: Record<string, any>; localized?: boolean };
export type FakeCmsOp = "list" | "get" | "create" | "update" | "listContentTypes" | "contentTypeSchema";

export function fakeCms(types: FakeType[], seed: Record<string, Record<string, any>[]> = {}) {
  const tables = new Map<string, Map<string, Record<string, any>>>();
  const calls: { op: FakeCmsOp; uid?: string; id?: string; data?: Record<string, any> }[] = [];
  const failures: { op: FakeCmsOp; uid?: string; error: Error }[] = [];
  let seq = 0;

  const table = (uid: string) => {
    let t = tables.get(uid);
    if (!t) tables.set(uid, (t = new Map()));
    return t;
  };
  for (const [uid, rows] of Object.entries(seed)) {
    for (const row of rows) {
      const id = String(row.documentId ?? `seed-${++seq}`);
      table(uid).set(id, { ...row, documentId: id });
    }
  }

  const typeOf = (uid: string) => types.find((t) => t.uid === uid);
  const takeFailure = (op: FakeCmsOp, uid?: string) => {
    const i = failures.findIndex((f) => f.op === op && (!f.uid || f.uid === uid));
    if (i >= 0) throw failures.splice(i, 1)[0].error;
  };
  const validate = (uid: string, data: Record<string, any>, action: "create" | "update") => {
    const t = typeOf(uid);
    if (!t) throw new CmsError(`${action} failed: Not Found`, 404);
    const problems: string[] = [];
    for (const [name, a] of Object.entries(t.attributes)) {
      const v = data[name];
      if (action === "create" && a.required && (v === undefined || v === null || v === "")) problems.push(`${name} must be defined.`);
      if (v !== undefined && Array.isArray(a.enum) && !a.enum.includes(v)) problems.push(`${name} must be one of the following values: ${a.enum.join(", ")}`);
    }
    for (const key of Object.keys(data)) if (!(key in t.attributes)) problems.push(`Invalid key ${key}`);
    if (problems.length) throw new CmsError(`${action} failed: ${problems.join("; ")}`, 400);
  };

  const cms: AgentCms = {
    async list(uid: string, query?: EntryQuery) {
      calls.push({ op: "list", uid });
      takeFailure("list", uid);
      if (!typeOf(uid)) throw new CmsError("list failed: Not Found", 404);
      const q = (query?.q || "").toLowerCase();
      const rows = [...table(uid).values()].filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
      const pageSize = query?.pageSize ?? 25;
      return { data: rows.slice(0, pageSize) as any[], total: rows.length, pageCount: Math.max(1, Math.ceil(rows.length / pageSize)) };
    },
    async get(uid: string, id: string) {
      calls.push({ op: "get", uid, id });
      takeFailure("get", uid);
      return (table(uid).get(id) as any) ?? null;
    },
    async create(uid: string, data: Record<string, any>) {
      calls.push({ op: "create", uid, data });
      takeFailure("create", uid);
      validate(uid, data, "create");
      const id = `doc-${++seq}`;
      const row = { ...data, documentId: id };
      table(uid).set(id, row);
      return row as any;
    },
    async update(uid: string, id: string, data: Record<string, any>) {
      calls.push({ op: "update", uid, id, data });
      takeFailure("update", uid);
      const row = table(uid).get(id);
      if (!row) throw new CmsError("update failed: Not Found", 404);
      validate(uid, data, "update");
      Object.assign(row, data);
      return row as any;
    },
    async listContentTypes() {
      calls.push({ op: "listContentTypes" });
      return types.map((t) => ({ uid: t.uid, label: t.name }));
    },
    async contentTypeSchema(uid: string) {
      calls.push({ op: "contentTypeSchema", uid });
      takeFailure("contentTypeSchema", uid);
      const t = typeOf(uid);
      return t ? digestContentType(t) : null;
    },
  };

  return {
    cms,
    calls,
    rows: (uid: string) => [...table(uid).values()],
    failNext(op: FakeCmsOp, error: Error, uid?: string) {
      failures.push({ op, uid, error });
    },
  };
}
