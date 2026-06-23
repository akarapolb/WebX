"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

type Row = Record<string, any>;
const SLA_DAYS = 3;
const TABS = [
  { uid: "api::complaint.complaint", key: "f.complaint", pf: "filters[stage][$lt]=3" },
  { uid: "api::application.application", key: "f.application", pf: "filters[stage][$lt]=3" },
  { uid: "api::contact-message.contact-message", key: "f.contact", pf: "filters[handled][$eq]=false" },
  { uid: "api::registration.registration", key: "f.registration", pf: "filters[verified][$eq]=false" },
];
const STAGE_TH = ["รับเรื่อง", "กำลังตรวจสอบ", "กำลังดำเนินการ", "เสร็จสิ้น"];
const STAGE_EN = ["Received", "In review", "In progress", "Done"];
const SKIP = new Set([
  "id", "documentId", "createdAt", "updatedAt", "publishedAt", "locale", "localizations",
  "createdBy", "updatedBy", "tenant", "stage", "handled", "verified", "status", "ref", "anonymous", "steps", "extra",
]);

function subjectOf(e: Row): string {
  for (const k of ["subject", "ref", "name", "fullname", "title", "username", "firstname", "position"]) if (typeof e[k] === "string" && e[k].trim()) return e[k];
  return "#" + (e.documentId ?? e.id ?? "—");
}
function fromOf(e: Row): string {
  if (e.anonymous) return "anonymous (PDPA)";
  return e.email || e.name || [e.firstname, e.lastname].filter(Boolean).join(" ") || e.phone || "—";
}
const fmt = (s?: string) => { try { return s ? new Date(s).toLocaleString() : "—"; } catch { return "—"; } };
const labelize = (k: string) => k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());
function statusKind(e: Row): "stage" | "verified" | "handled" {
  if (typeof e.stage === "number") return "stage";
  if (typeof e.verified === "boolean") return "verified";
  return "handled";
}
function isPending(e: Row): boolean {
  const k = statusKind(e);
  return k === "stage" ? (e.stage ?? 0) < 3 : k === "verified" ? !e.verified : !e.handled;
}
const ageDays = (e: Row) => { const d = e.date || e.createdAt; const t = d ? new Date(d).getTime() : NaN; return isNaN(t) ? 0 : (Date.now() - t) / 86400000; };
const isOverdue = (e: Row) => isPending(e) && ageDays(e) > SLA_DAYS;
const mediaSrc = (u: string) => (u.startsWith("http") ? u : "/api/strapi" + u);

export default function FormsInbox() {
  const { t, lang } = useLang();
  const th = lang === "th";
  const [tab, setTab] = useState(TABS[0].uid);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "handled">("all");
  const [detail, setDetail] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (uid: string) => {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + uid + "?page=1&pageSize=100&sort=createdAt:DESC");
      if (r.status === 403) { setErr(t("c.noPerm")); setRows([]); setLoading(false); return; }
      if (!r.ok) { setRows([]); setLoading(false); return; }
      const j = await r.json();
      const list: Row[] = j.results ?? j.data ?? [];
      setRows(list); setTotal(j.pagination?.total ?? list.length);
    } catch { setErr("Cannot reach the backend."); }
    finally { setLoading(false); }
  }, [t]);

  const loadPending = useCallback(async () => {
    const pairs = await Promise.all(TABS.map(async (x) => {
      try {
        const r = await fetch("/api/strapi/content-manager/collection-types/" + x.uid + "?page=1&pageSize=1&" + x.pf);
        return [x.uid, r.ok ? ((await r.json()).pagination?.total ?? 0) : 0] as const;
      } catch { return [x.uid, 0] as const; }
    }));
    setPending(Object.fromEntries(pairs));
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);
  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { setQ(""); setFilter("all"); }, [tab]);

  async function updateStatus(e: Row, patch: Record<string, any>) {
    setSaving(true);
    const id = e.documentId ?? e.id;
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + tab + "/" + id, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (r.ok) {
        setRows((rs) => rs.map((x) => ((x.documentId ?? x.id) === id ? { ...x, ...patch } : x)));
        setDetail((d) => (d && (d.documentId ?? d.id) === id ? { ...d, ...patch } : d));
        loadPending();
      }
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  const shown = rows.filter((e) => {
    if (filter === "pending" && !isPending(e)) return false;
    if (filter === "handled" && isPending(e)) return false;
    if (q.trim()) { const hay = (subjectOf(e) + " " + fromOf(e)).toLowerCase(); if (!hay.includes(q.trim().toLowerCase())) return false; }
    return true;
  });

  function exportCsv() {
    const cell = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Subject", "From", "Received", "Status"];
    const lines = shown.map((e) => [subjectOf(e), fromOf(e), fmt(e.createdAt), isPending(e) ? "Pending" : "Handled"].map(cell).join(","));
    const csv = "﻿" + [head.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (TABS.find((x) => x.uid === tab)?.uid.split(".").pop() || "forms") + "-export.csv";
    a.click(); URL.revokeObjectURL(a.href);
  }

  function StatusBadge({ e }: { e: Row }) {
    const k = statusKind(e), pend = isPending(e), over = isOverdue(e);
    let label = pend ? (th ? "รอดำเนินการ" : "Pending") : (th ? "เสร็จสิ้น" : "Handled");
    if (k === "stage") label = (th ? STAGE_TH : STAGE_EN)[e.stage ?? 0];
    if (k === "verified" && !pend) label = th ? "ยืนยันแล้ว" : "Verified";
    return (
      <span className="fi-status">
        <span className={"badge " + (pend ? (over ? "b-bad" : "b-warn") : "b-ok")}><span className="dot" />{label}</span>
        {over && <span className="sla-pill">{th ? `เกิน ${Math.floor(ageDays(e) - SLA_DAYS)} วัน` : `${Math.floor(ageDays(e) - SLA_DAYS)}d late`}</span>}
      </span>
    );
  }

  const overdueCount = rows.filter(isOverdue).length;
  const FILTERS: { v: "all" | "pending" | "handled"; label: string }[] = [
    { v: "all", label: th ? "ทั้งหมด" : "All" },
    { v: "pending", label: th ? "รอดำเนินการ" : "Pending" },
    { v: "handled", label: th ? "เสร็จแล้ว" : "Handled" },
  ];

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.forms")}</h1><p>{t("f.sub")}</p></div>
        <div className="vh-act">
          <button className="btn btn--g" onClick={() => { load(tab); loadPending(); }}><Icon name="undo" />{t("c.refresh")}</button>
          <button className="btn btn--g" onClick={exportCsv} disabled={shown.length === 0}><Icon name="doc" />{th ? "ส่งออก CSV" : "Export CSV"}</button>
        </div>
      </div>

      <div className="fi-tabs">
        {TABS.map((x) => (
          <button key={x.uid} className={tab === x.uid ? "on" : ""} onClick={() => setTab(x.uid)}>
            <span>{t(x.key)}</span>
            {pending[x.uid] ? <span className="fi-tab-n">{pending[x.uid]}</span> : null}
          </button>
        ))}
      </div>

      {!err && (
        <div className="cbar">
          <div className="seg">
            {FILTERS.map((f) => (
              <button key={f.v} className={filter === f.v ? "on" : ""} onClick={() => setFilter(f.v)}>{f.label}</button>
            ))}
          </div>
          <div className="cinput">
            <Icon name="search" />
            <input value={q} placeholder={th ? "ค้นหาหัวข้อ / ผู้ส่ง…" : "Search subject / sender…"} onChange={(e) => setQ(e.target.value)} />
          </div>
          {overdueCount > 0 && <span className="fi-overdue"><Icon name="clock" />{th ? `เกิน SLA ${overdueCount} เรื่อง` : `${overdueCount} overdue`}</span>}
        </div>
      )}

      {err && <div className="panel"><span className="badge b-warn"><span className="dot" />!</span><span className="muted" style={{ marginLeft: 10 }}>{err}</span></div>}

      {!err && (
        <div className="panel ctbl" style={{ padding: "6px 0", minHeight: 220 }}>
          {loading && <div className="muted" style={{ padding: 20 }}>{t("f.loading")}</div>}
          {!loading && shown.length === 0 && <div className="muted" style={{ padding: 28, textAlign: "center" }}>{t("f.empty")}</div>}
          {!loading && shown.length > 0 && (
            <table className="tbl">
              <thead><tr><th>{t("f.colItem")}</th><th>{t("f.colFrom")}</th><th>{t("f.colDate")}</th><th>{t("f.colStatus")}</th><th aria-hidden /></tr></thead>
              <tbody>
                {shown.map((e) => (
                  <tr className="row" key={e.documentId ?? e.id} onClick={() => setDetail(e)}>
                    <td><b>{subjectOf(e)}</b></td>
                    <td className="mono" style={{ fontSize: 12 }}>{fromOf(e)}</td>
                    <td className="muted">{fmt(e.createdAt)}</td>
                    <td><StatusBadge e={e} /></td>
                    <td className="row-go-cell"><span className="row-go"><Icon name="chevron" /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("c.bffnote")}</div>

      {detail && (
        <>
          <div className="scrim" onClick={() => setDetail(null)} />
          <div className="drawer sd">
            <div className="ovhead">
              <div style={{ flex: 1 }}>
                <h3>{subjectOf(detail)}</h3>
                <div className="meta">{detail.ref ? detail.ref + " · " : ""}{fromOf(detail)}</div>
              </div>
              <button className="ic-btn" onClick={() => setDetail(null)}><Icon name="close" /></button>
            </div>

            <div className="ovbody">
              {/* status control */}
              <div className="sd-status">
                <div className="sd-status-h">
                  <span>{th ? "สถานะการดำเนินงาน" : "Processing status"}</span>
                  {isOverdue(detail)
                    ? <span className="sla-pill">{th ? `เกิน SLA ${Math.floor(ageDays(detail) - SLA_DAYS)} วัน` : `${Math.floor(ageDays(detail) - SLA_DAYS)}d over SLA`}</span>
                    : <span className="muted" style={{ fontSize: 11.5 }}>{th ? `รับเมื่อ ${Math.floor(ageDays(detail))} วันก่อน` : `received ${Math.floor(ageDays(detail))}d ago`}</span>}
                </div>
                {statusKind(detail) === "stage" ? (
                  <div className="sd-steps">
                    {(th ? STAGE_TH : STAGE_EN).map((s, i) => (
                      <button key={i} disabled={saving} className={"sd-step" + (i === (detail.stage ?? 0) ? " on" : i < (detail.stage ?? 0) ? " done" : "")} onClick={() => updateStatus(detail, { stage: i })}>
                        <span className="sd-step-n">{i < (detail.stage ?? 0) ? "✓" : i + 1}</span>{s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="sd-toggle">
                    {(() => {
                      const k = statusKind(detail), done = k === "verified" ? !!detail.verified : !!detail.handled;
                      const field = k === "verified" ? "verified" : "handled";
                      return (
                        <>
                          <span className={"badge " + (done ? "b-ok" : "b-warn")}><span className="dot" />{done ? (k === "verified" ? (th ? "ยืนยันแล้ว" : "Verified") : (th ? "จัดการแล้ว" : "Handled")) : (th ? "รอดำเนินการ" : "Pending")}</span>
                          <button className={"btn " + (done ? "btn--g" : "btn--p")} disabled={saving} onClick={() => updateStatus(detail, { [field]: !done })}>
                            <Icon name="check" />{done ? (th ? "ตีกลับเป็นรอ" : "Mark pending") : (k === "verified" ? (th ? "ยืนยันคำขอ" : "Verify") : (th ? "ทำเครื่องหมายว่าจัดการแล้ว" : "Mark handled"))}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* fields */}
              <div className="sd-fields">
                {Object.keys(detail).filter((k) => !SKIP.has(k) && !(detail[k] && typeof detail[k] === "object")).map((k) => {
                  const v = detail[k];
                  if (v === null || v === undefined || v === "") return null;
                  return (
                    <div className="sd-field" key={k}>
                      <span className="sd-k">{labelize(k)}</span>
                      <span className="sd-v">{String(v)}</span>
                    </div>
                  );
                })}
                <div className="sd-field"><span className="sd-k">{th ? "รับเมื่อ" : "Received"}</span><span className="sd-v">{fmt(detail.createdAt)}</span></div>
              </div>

              {/* attachments */}
              {Object.keys(detail).map((k) => {
                const v = detail[k];
                if (v && typeof v === "object" && typeof v.url === "string") {
                  return (
                    <a key={k} className="sd-file" href={mediaSrc(v.url)} target="_blank" rel="noreferrer">
                      <Icon name="doc" /><span>{v.name || labelize(k)}</span><Icon name="eye" />
                    </a>
                  );
                }
                return null;
              })}
            </div>

            <div className="ovfoot">
              <span className="sp">{th ? "อัปเดตสถานะมีผลทันที · ข้อมูลผู้ส่งแก้ไขไม่ได้ (PDPA)" : "Status updates apply instantly · sender data is read-only (PDPA)"}</span>
              <button className="btn btn--g" onClick={() => setDetail(null)}>{th ? "ปิด" : "Close"}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
