"use client";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "./Icon";
import EntryEditor from "./EntryEditor";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { planLimit } from "@/lib/plans";

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
function relTime(s?: string, th?: boolean): string {
  if (!s) return "—";
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (isNaN(d)) return "—";
  if (d < 60) return th ? "เมื่อสักครู่" : "just now";
  const m = Math.floor(d / 60); if (m < 60) return th ? `${m} นาทีที่แล้ว` : `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return th ? `${h} ชม.ที่แล้ว` : `${h}h ago`;
  const dy = Math.floor(h / 24); if (dy < 30) return th ? `${dy} วันที่แล้ว` : `${dy}d ago`;
  return fmtDate(s);
}
const TYPE_ICON: Record<string, string> = {
  article: "doc", blog: "doc", landing: "doc", page: "doc", "home-page": "home",
  service: "layout", catalog: "layout",
  banner: "img", gallery: "img", "top-graphic": "img", popup: "img",
  faq: "inbox", complaint: "inbox", "contact-message": "inbox",
  application: "users", job: "users", registration: "users",
  event: "calendar", video: "desktop", download: "doc", ebook: "doc",
  award: "check", review: "check", poll: "check",
  weblink: "code", "menu-item": "code", "block-type": "code",
  "consent-log": "shield", "audit-log": "shield", "field-policy": "lock",
  release: "package", location: "home", tenant: "package",
};
const typeIcon = (api: string) => TYPE_ICON[api] || "doc";
const subtitleOf = (e: Entry): string => {
  for (const k of ["slug", "ref", "code", "position"]) if (typeof e[k] === "string" && e[k].trim()) return e[k];
  return "";
};
const mediaSrc = (u: string) => (u.startsWith("http") ? u : "/api/strapi" + u);
function imageOf(e: Entry): string {
  const pick = (v: any) => (v && typeof v === "object" && typeof v.url === "string") ? (v.formats?.thumbnail?.url || v.formats?.small?.url || v.url) : "";
  for (const k of ["image", "cover", "coverImage", "thumbnail", "photo", "banner", "picture", "logo"]) { const u = pick(e[k]); if (u) return u; }
  for (const k of Object.keys(e)) { if (Array.isArray(e[k])) continue; const u = pick(e[k]); if (u) return u; }
  return "";
}

export default function ContentBrowser() {
  const { t, lang } = useLang();
  const { currentKey } = useTenant();
  const typeParam = useSearchParams().get("type");
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
  const [view, setView] = useState<"list" | "grid">("list");
  useEffect(() => { try { const v = localStorage.getItem("webx_content_view"); if (v === "grid" || v === "list") setView(v); } catch {} }, []);
  const setViewP = (v: "list" | "grid") => { setView(v); try { localStorage.setItem("webx_content_view", v); } catch {} };

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
        const want = typeParam ? list.find((x) => x.api === typeParam) : null;
        const first = want ?? list.find((x) => x.api === "article") ?? list[0];
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

  // react to ?type= changes (e.g. clicking a pinned type in the sidebar while already here)
  useEffect(() => {
    if (!typeParam || types.length === 0) return;
    const m = types.find((x) => x.api === typeParam);
    if (m && m.uid !== uid) setUid(m.uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeParam, types]);

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
    // tenant-scoped types: attach the selected tenant so the entry isn't orphaned.
    // A super-admin creator isn't auto-resolved to a tenant by the backend, so a
    // new entry would otherwise have no tenant and vanish from the filtered list.
    if (tenantUids.has(uid) && currentKey && currentKey !== "workspace") {
      try {
        const [tj, sum] = await Promise.all([
          fetch("/api/strapi/content-manager/collection-types/api::tenant.tenant?pageSize=1&filters[key][$eq]=" + encodeURIComponent(currentKey)).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/strapi/api/analytics/summary?tenant=" + encodeURIComponent(currentKey)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        const tn = (tj?.results ?? tj?.data ?? [])[0];
        // usage metering: block creation once the plan's content limit is reached
        const limit = planLimit(tn?.plan).items;
        const used = sum?.contentTotal ?? 0;
        if (used >= limit) { setErr(t("c.overLimit").replace("{n}", String(limit)).replace("{plan}", String(tn?.plan || "free"))); setCreating(false); return; }
        if (tn?.id) body.tenant = tn.id;
      } catch { /* fall back to backend tenant injection */ }
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
        <>
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
              <div className="view-tg" role="tablist" aria-label="View mode">
                <button className={view === "list" ? "on" : ""} onClick={() => setViewP("list")} title={lang === "th" ? "มุมมองรายการ" : "List view"} aria-label="List"><Icon name="list" /></button>
                <button className={view === "grid" ? "on" : ""} onClick={() => setViewP("grid")} title={lang === "th" ? "มุมมองตาราง" : "Grid view"} aria-label="Grid"><Icon name="grid" /></button>
              </div>
            </div>

            <div className={"panel " + (view === "grid" ? "cgwrap" : "ctbl")} style={view === "grid" ? { padding: 16, minHeight: 220 } : { padding: "6px 0", minHeight: 220 }}>
              {(loadingRows || loadingTypes) && view === "grid" && (
                <div className="cgridv">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="cgc cgc--sk">
                      <span className="skln" style={{ display: "block", height: 94, borderRadius: 10 }} />
                      <span className="skln" style={{ display: "block", width: "72%", marginTop: 11 }} />
                      <span className="skln" style={{ display: "block", width: "44%", marginTop: 7 }} />
                    </div>
                  ))}
                </div>
              )}
              {(loadingRows || loadingTypes) && view === "list" && (
                <table className="tbl">
                  <thead><tr><th>{t("c.colTitle")}</th><th>{t("c.colStatus")}</th><th>{t("c.colLocale")}</th><th>{t("c.colUpdated")}</th><th aria-hidden /></tr></thead>
                  <tbody>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <tr key={i}>
                        <td><div className="row-ti"><span className="skln skln-av" /><span className="skln" style={{ width: 150 + (i % 4) * 40 }} /></div></td>
                        <td><span className="skln" style={{ width: 72 }} /></td>
                        <td><span className="skln" style={{ width: 28 }} /></td>
                        <td><span className="skln" style={{ width: 64 }} /></td>
                        <td />
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!loadingRows && !loadingTypes && entries.length === 0 && (
                <div className="cempty">
                  <span className="ic"><Icon name={current ? typeIcon(current.api) : "doc"} /></span>
                  <b>{lang === "th" ? "ยังไม่มีเนื้อหา" : "No entries yet"}</b>
                  <p>{lang === "th" ? `เริ่มสร้างรายการแรกของ ${current?.name ?? ""}` : `Create your first ${current?.name ?? ""} entry`}</p>
                  <button className="btn btn--p" onClick={createNew} disabled={!uid || creating}><Icon name="plus" />{t("c.new")}</button>
                </div>
              )}
              {!loadingRows && !loadingTypes && entries.length > 0 && (
                <>
                  {view === "list" && (
                  <table className="tbl">
                    <thead><tr><th>{t("c.colTitle")}</th><th>{t("c.colStatus")}</th><th>{t("c.colLocale")}</th><th>{t("c.colUpdated")}</th><th aria-hidden /></tr></thead>
                    <tbody>
                      {entries.map((e) => {
                        const sub = subtitleOf(e);
                        const pub = e.status === "published" || e.publishedAt;
                        return (
                          <tr className="row" key={e.documentId ?? e.id}
                            onClick={() => setEditing({ docId: String(e.documentId ?? e.id), locale: e.locale })}>
                            <td>
                              <div className="row-ti">
                                <span className="row-av">{titleOf(e)[0]?.toUpperCase() || "#"}</span>
                                <span className="row-tt"><b>{titleOf(e)}</b>{sub && <span>{sub}</span>}</span>
                              </div>
                            </td>
                            <td>{pub
                              ? <span className="badge b-ok"><span className="dot" />{t("c.published")}</span>
                              : <span className="badge b-mut"><span className="dot" />{t("c.draft")}</span>}</td>
                            <td className="mono" style={{ fontSize: 12 }}>{e.locale ?? "—"}</td>
                            <td className="muted">{relTime(e.updatedAt, lang === "th")}</td>
                            <td className="row-go-cell"><span className="row-go"><Icon name="chevron" /></span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  )}
                  {view === "grid" && (
                    <div className="cgridv">
                      {entries.map((e) => {
                        const img = imageOf(e);
                        const pub = e.status === "published" || e.publishedAt;
                        return (
                          <button className="cgc" key={e.documentId ?? e.id} onClick={() => setEditing({ docId: String(e.documentId ?? e.id), locale: e.locale })}>
                            <div className="cgc-thumb">
                              {img ? <img src={mediaSrc(img)} alt="" loading="lazy" /> : <span className="cgc-ini">{titleOf(e)[0]?.toUpperCase() || "#"}</span>}
                              <span className={"cgc-badge badge " + (pub ? "b-ok" : "b-mut")}><span className="dot" />{pub ? t("c.published") : t("c.draft")}</span>
                            </div>
                            <div className="cgc-b">
                              <div className="cgc-title">{titleOf(e)}</div>
                              <div className="cgc-meta">{(e.locale ?? "—") + " · " + relTime(e.updatedAt, lang === "th")}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
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
        </>
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
