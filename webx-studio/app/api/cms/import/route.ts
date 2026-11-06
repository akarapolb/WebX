// Creates entries from the rows of an imported file, one request per chunk of rows. Each row is checked
// again here (lib/importData.ts, the same code the Content page previews with) and created through
// governed.create, so the caller's tenant, role, field policies and plan limits apply exactly as they do
// when an entry is made by hand. Entries start as drafts; nothing is published.
import { NextRequest } from "next/server";
import { governed } from "@/lib/cms/governance";
import { CmsError } from "@/lib/cms/types";
import { handle } from "@/lib/cms/route-helpers";
import { importFieldsFor } from "@/lib/importFields";
import { coerceRecord, titleKeyOf, IMPORT_CHUNK, type RowError } from "@/lib/importData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RowResult =
  | { i: number; status: "created"; id: string }
  | { i: number; status: "skipped" }
  | { i: number; status: "error"; errors: RowError[]; message?: string };

const titleOf = (e: any): string => String(e?.title ?? e?.name ?? e?.subject ?? e?.question ?? e?.label ?? "").trim();

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => ({} as any));
    const uid = typeof body.uid === "string" ? body.uid : "";
    const rows: unknown[] = Array.isArray(body.rows) ? body.rows : [];
    if (!uid) throw new CmsError("uid is required", 400);
    if (!rows.length || rows.length > IMPORT_CHUNK) throw new CmsError(`Send 1 to ${IMPORT_CHUNK} rows per request.`, 400);
    const fields = await importFieldsFor(uid);
    if (!fields) throw new CmsError("This content type cannot be imported.", 404);
    const titleKey = body.skipExisting === true ? titleKeyOf(fields) : null;
    const tenant = typeof body.tenant === "number" || typeof body.tenant === "string" ? body.tenant : undefined;

    const results: RowResult[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rec: Record<string, string> = {};
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string") rec[k] = v;
      }
      const { data, errors } = coerceRecord(rec, fields);
      if (errors.length) { results.push({ i, status: "error", errors }); continue; }
      if (!Object.keys(data).length) { results.push({ i, status: "error", errors: [{ field: "", code: "required" }] }); continue; }
      try {
        if (titleKey && typeof data[titleKey] === "string") {
          const title = (data[titleKey] as string).trim();
          const dup = seen.has(title) || (await governed.list<any>(uid, { q: title, pageSize: 10 })).data.some((e) => titleOf(e) === title);
          seen.add(title);
          if (dup) { results.push({ i, status: "skipped" }); continue; }
        }
        const created: any = await governed.create(uid, tenant !== undefined ? { ...data, tenant } : data);
        results.push({ i, status: "created", id: String(created?.documentId ?? created?.id ?? "") });
      } catch (e: any) {
        // One bad row must not stop the rest; the message is the CMS's own (a limit, a permission, a rejected value).
        results.push({ i, status: "error", errors: [], message: e instanceof CmsError ? e.message : "Could not create this row." });
        if (e instanceof CmsError && (e.status === 401 || e.status === 403)) {
          for (let j = i + 1; j < rows.length; j++) results.push({ i: j, status: "error", errors: [], message: e.message });
          break;
        }
      }
    }
    return { uid, results };
  });
}
