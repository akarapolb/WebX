"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import EntryEditor from "./EntryEditor";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

type CType = { uid: string; name: string; api: string };
type Entry = Record<string, any>;
type Status = "" | "draft" | "published";

function titleOf(e: Entry): string {
  for (const k of ["title", "name", "subject", "question", "label", "ref", "displayName"]) {
    if (typeof e[k] === "string" && e[k].trim()) return e[k];
  }
  return "#" + (e.documentId ?? e.id ?? "—");
}
function fmtDate(s?: string): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return "—"; }
}

export default function ContentBrowser() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const [types, setTypes] = useState<CType[]>([]);
  const [tenantUids, setTenantUids] = useState<Set<string>>(new Set());
  const [uid, setUid] = useState<string>("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status>("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [editing, setEditing] = useState<{ docId: string; locale?: string } | null>(null);
  const [schemas, setSchemas] = useState<Record<string, any>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/strapi/content-manager/content-types");
        if (r.status === 403) { setErr(t("c.noPerm")); setLoadingTypes(false); return; }
        if (!r.ok) { setErr("Could not load content types (HTTP " + r.status + ")."); setLoadingTypes(false); return; }
        const j = await r.json();
        const raw = (j.data ?? j.results ?? []).filter((x: any) => x.kind === "collectionType" && typeof x.uid === "string" && x.uid.startsWith("api::") && x.isDisplayed !== false);
        const list: CType[] = raw
          .map((x: any) => ({ uid: x.uid, name: x.info?.displayName ?? x.apiID ?? x.uid, api: x.apiID ?? "" }))
          .sort((a: CType, b: CType) => a.name.localeCompare(b.name));
        setTypes(list);
        const sch: Record<string, any> = {};
        raw.forEach((x: any) => { sch[x.uid] = x.attributes || {}; });
        setSchemas(sch);
        setTenantUids(new Set(raw.filter((x: any) => x.attributes?.tenant).map((x: any) => x.uid)));
        const first = list.find((x) => x.api === "article") ?? list[0];
        if (first) setUid(first.uid); else setErr("No content types are exposed by this backend.");
      } catch { setErr("Cannot reach the backend."); }
      finally { setLoadingTypes(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEntries = useCallback(async (u: string, opts: { status: Status; q: string; page: number; tenantKey: string }) => {
    setLoadingRows(true);
    try {
      let qs = "?page=" + opts.page + "&pageSize=25&sort=updatedAt:DESC";
      if (opts.status) qs += "&status=" + opts.status;
      if (opts.q.trim()) qs += "&_q=" + encodeURIComponent(opts.q.trim());
      if (opts.tenantKey) qs += "&filters[tenant][key][$eq]=" + encodeURIComponent(opts.tenantKey);
      const r = await fetch("/api/strapi/content-manager/collection-types/" + u + qs);
      if (!r.ok) { setEntries([]); setLoadingRows(false); return; }
      const j = await r.json();
      const rows: Entry[] = j.results ?? j.data ?? [];
      setEntries(rows);
      setTotal(j.pagination?.total ?? rows.length);
      setPageCount(j.pagination?.pageCount ?? 1);
    } catch { setEntries([]); } finally { setLoadingRows(false); }
  }, []);

  const tenantKey = (uid && tenantUids.has(uid) && currentKey && currentKey !== "workspace") ? currentKey : "";
  const opts = { status, q, page, tenantKey };

  useEffect(() => { setPage(1); }, [uid, status, currentKey]);
  useEffect(() => {
    if (!uid) return;
    const id = setTimeout(() => { setPage(1); loadEntries(uid, { status, q, page: 1, tenantKey }); }, q ? 350 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => { if (uid) loadEntries(uid, { status, q, page, tenantKey }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, status, page, currentKey, tenantUids]);

  const current = types.find((x) => x.uid === uid);

  // create a blank entry (fill required scalar fields) then open it in the editor
  async function createNew() {
    if (!uid || !current) return;
    setCreating(true); setErr("");
    const attrs = schemas[uid] || {};
    const body: Record<string, any> = {};
    for (const [k, a] of Object.entries(attrs)) {
      const at: any = a;
      if (!at?.required) continue;
      if (at.type === "string" || at.type === "text" || at.type === "uid" || at.type === "richtext") body[k] = "Untitled";
      else if (at.type === "email") body[k] = "noreply@example.com";
      else if (at.type === "integer" || at.type === "biginteger" || at.type === "float" || at.type === "decimal") body[k] = 0;
      else if (at.type === "boolean") body[k] = false;
    }
    for (const tk of ["title", "name", "subject", "question", "label"]) {
      const a: any = attrs[tk];
      if (a && (a.type === "string" || a.type === "text")) { body[tk] = "Untitled " + current.name; break; }
    }
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + uid, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { setErr(t("c.createFail") + " (HTTP " + r.status + ")"); setCreating(false); return; }
      const j = await r.json(); const e = j.data ?? j;
      const docId = e.documentId ?? e.id;
      if (docId) { setEditing({ docId: String(docId), locale: e.locale }); loadEntries(uid, opts); }
    } catch { setErr("Cannot reach the backend."); }
    finally { setCreating(false); }
  }

  const SEG: { v: Status; k: string }[] = [{ v: "", k: "c.all" }, { v: "draft", k: "c.draft" }, { v: "published", k: "c.published" }];

  return (
    <>
      <div className="vh">
        <div>
          <h1>{t("c.title")}</h1>
          <p>{current ? current.name + (total != null ? " · " + total + " " + t("c.entries") : "") : t("c.browse")}</p>
        </div>
        <div className="vh-act">
          <button className="btn btn--g" onClick={() => uid && loadEntries(uid, opts)}>{t("c.refresh")}</button>
          <button className="btn btn--p" onClick={createNew} disabled={!uid || creating}><Icon name="plus" />{creating ? t("c.creating") : t("c.new")}</button>
        </div>
      </div>

      {err && (
        <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>
      )}

      {!err && (
        <div className="cgrid">
          <aside className="ctypes">
            {loadingTypes && <div className="muted" style={{ padding: 12 }}>{t("c.loadingTypes")}</div>}
            {types.map((x) => (
              <button key={x.uid} className={"ctype" + (x.uid === uid ? " on" : "")} onClick={() => setUid(x.uid)}>
                <Icon name="doc" /><span>{x.name}</span>
              </button>
            ))}
          </aside>

          <div>
            <div className="cbar">
              <div className="seg">
                {SEG.map((s) => (
                  <button key={s.v} className={status === s.v ? "on" : ""} onClick={() => setStatus(s.v)}>{t(s.k)}</button>
                ))}
              </div>
              <div className="cinput">
                <Icon name="search" />
                <input value={q} placeholder={t("c.searchPh")} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>

            <div className="panel" style={{ padding: "8px 0", minHeight: 200 }}>
              {loadingRows && <div className="muted" style={{ padding: 20 }}>{t("c.loadingRows")}</div>}
              {!loadingRows && entries.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>{t("c.noEntries")}</div>}
              {!loadingRows && entries.length > 0 && (
                <>
                  <table className="tbl">
                    <thead><tr><th>{t("c.colTitle")}</th><th>{t("c.colStatus")}</th><th>{t("c.colLocale")}</th><th>{t("c.colUpdated")}</th></tr></thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr className="row" key={e.documentId ?? e.id}
                          onClick={() => setEditing({ docId: String(e.documentId ?? e.id), locale: e.locale })}>
                          <td><b>{titleOf(e)}</b></td>
                          <td>{(e.status === "published" || e.publishedAt)
                            ? <span className="badge b-ok"><span className="dot" />{t("c.published")}</span>
                            : <span className="badge b-mut"><span className="dot" />{t("c.draft")}</span>}</td>
                          <td className="mono" style={{ fontSize: 12 }}>{e.locale ?? "—"}</td>
                          <td>{fmtDate(e.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pageCount > 1 && (
                    <div className="pager">
                      <span className="pinfo">{t("c.page")} {page} / {pageCount}</span>
                      <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t("c.prev")}</button>
                      <button disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>{t("c.next")}</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("c.bffnote")}</div>

      {editing && current && (
        <EntryEditor
          uid={current.uid} docId={editing.docId} locale={editing.locale} typeName={current.name}
          mediaKeys={Object.entries(schemas[current.uid] || {}).filter(([, a]: any) => a?.type === "media" && a?.multiple !== true).map(([k]) => k)}
          onClose={() => setEditing(null)} onSaved={() => loadEntries(current.uid, opts)}
        />
      )}
    </>
  );
}
