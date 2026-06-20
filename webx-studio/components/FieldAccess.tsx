"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

type Role = { id: number; name: string };
type CType = { uid: string; label: string };
const FP_UID = "api::field-policy.field-policy";
const SYS = new Set(["id", "documentId", "createdAt", "updatedAt", "publishedAt", "locale", "status", "createdBy", "updatedBy", "localizations"]);
const HIDE = new Set(["api::field-policy.field-policy", "api::audit-log.audit-log", "api::page-version.page-version", "api::ab-event.ab-event", "api::review.review", "api::release.release", "api::tenant.tenant", "api::block-type.block-type"]);

export default function FieldAccess() {
  const { t } = useLang();
  const [roles, setRoles] = useState<Role[]>([]);
  const [types, setTypes] = useState<CType[]>([]);
  const [role, setRole] = useState("");
  const [ctype, setCtype] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [readonly, setReadonly] = useState<Set<string>>(new Set());
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/strapi/admin/roles").then((r) => (r.ok ? r.json() : null)).then((j) => { const list = j?.data ?? j?.results ?? []; setRoles(list.map((r: any) => ({ id: r.id, name: r.name }))); }).catch(() => {});
    fetch("/api/strapi/content-manager/content-types").then((r) => (r.ok ? r.json() : null)).then((j) => {
      const list = (j?.data ?? []).filter((d: any) => typeof d.uid === "string" && d.uid.startsWith("api::") && !HIDE.has(d.uid));
      setTypes(list.map((d: any) => ({ uid: d.uid, label: d.info?.displayName || d.uid.replace(/^api::/, "").replace(/\..*$/, "") })));
    }).catch(() => {});
  }, []);

  const loadFor = useCallback(async (rl: string, ct: string) => {
    if (!rl || !ct) { setFields([]); return; }
    setLoading(true); setMsg(null); setHidden(new Set()); setReadonly(new Set()); setPolicyId(null);
    try {
      const er = await fetch("/api/strapi/content-manager/collection-types/" + ct + "?pageSize=1");
      const ej = await er.json();
      const e = (ej.results ?? ej.data ?? [])[0];
      const fs = e ? Object.keys(e).filter((k) => !SYS.has(k) && (typeof e[k] === "string" || typeof e[k] === "number" || typeof e[k] === "boolean" || e[k] == null)).slice(0, 40) : [];
      setFields(fs);
      const pr = await fetch("/api/strapi/content-manager/collection-types/" + FP_UID + "?pageSize=1&filters[role][$eq]=" + encodeURIComponent(rl) + "&filters[contentType][$eq]=" + encodeURIComponent(ct));
      const pj = await pr.json();
      const p = (pj.results ?? pj.data ?? [])[0];
      if (p) { setPolicyId(p.documentId ?? p.id); setHidden(new Set(Array.isArray(p.hidden) ? p.hidden : [])); setReadonly(new Set(Array.isArray(p.readonly) ? p.readonly : [])); }
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { loadFor(role, ctype); }, [role, ctype, loadFor]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, f: string) { const n = new Set(set); if (n.has(f)) n.delete(f); else n.add(f); setter(n); }

  async function save() {
    if (!role || !ctype) return;
    const body: any = { role, contentType: ctype, hidden: [...hidden], readonly: [...readonly] };
    try {
      if (policyId) await fetch("/api/strapi/content-manager/collection-types/" + FP_UID + "/" + policyId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      else { const r = await fetch("/api/strapi/content-manager/collection-types/" + FP_UID, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); const e = j.data ?? j; if (e?.documentId) setPolicyId(e.documentId); }
      setMsg({ t: t("fp.saved"), ok: true });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
  }

  return (
    <>
      <div className="vh"><div><h1>{t("nav.field-access")}</h1><p>{t("fp.sub")}</p></div></div>
      <div className="panel" style={{ padding: 16 }}>
        <div className="fp-pick">
          <label className="vb-fld" style={{ flex: 1 }}><span>{t("fp.role")}</span>
            <select className="vb-sel" style={{ width: "100%" }} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">{t("fp.pickrole")}</option>
              {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select></label>
          <label className="vb-fld" style={{ flex: 1 }}><span>{t("fp.ctype")}</span>
            <select className="vb-sel" style={{ width: "100%" }} value={ctype} onChange={(e) => setCtype(e.target.value)}>
              <option value="">{t("fp.picktype")}</option>
              {types.map((c) => <option key={c.uid} value={c.uid}>{c.label}</option>)}
            </select></label>
        </div>
        {role && ctype && (
          <>
            {loading && <div className="muted" style={{ padding: 12 }}>…</div>}
            {!loading && fields.length === 0 && <div className="muted" style={{ padding: 12 }}>{t("fp.nofields")}</div>}
            {!loading && fields.length > 0 && (
              <table className="tbl fp-tbl">
                <thead><tr><th>{t("fp.field")}</th><th style={{ width: 90, textAlign: "center" }}>{t("fp.hidden")}</th><th style={{ width: 90, textAlign: "center" }}>{t("fp.readonly")}</th></tr></thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f}>
                      <td className="mono">{f}</td>
                      <td style={{ textAlign: "center" }}><input type="checkbox" checked={hidden.has(f)} onChange={() => toggle(hidden, setHidden, f)} /></td>
                      <td style={{ textAlign: "center" }}><input type="checkbox" checked={readonly.has(f)} onChange={() => toggle(readonly, setReadonly, f)} disabled={hidden.has(f)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
              <button className="btn btn--p" onClick={save}>{t("fp.save")}</button>
              {msg && <span className={"toast-in " + (msg.ok ? "ok" : "bad")}>{msg.t}</span>}
            </div>
          </>
        )}
      </div>
      <div className="notice"><Icon name="shield" /> {t("fp.note")}</div>
    </>
  );
}
