"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms } from "@/lib/cms";

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
    cms.auth.listRoles().then((list) => setRoles(list.map((r) => ({ id: r.id, name: r.name })))).catch(() => {});
    cms.schema.listContentTypes().then((list) => {
      const filtered = list.filter((d) => !HIDE.has(d.uid));
      setTypes(filtered.map((d) => ({ uid: d.uid, label: d.name || d.uid.replace(/^api::/, "").replace(/\..*$/, "") })));
    }).catch(() => {});
  }, []);

  const loadFor = useCallback(async (rl: string, ct: string) => {
    if (!rl || !ct) { setFields([]); return; }
    setLoading(true); setMsg(null); setHidden(new Set()); setReadonly(new Set()); setPolicyId(null);
    try {
      const { data: sample } = await cms.entries.list<any>(ct, { pageSize: 1 });
      const e = sample[0];
      const fs = e ? Object.keys(e).filter((k) => !SYS.has(k) && (typeof e[k] === "string" || typeof e[k] === "number" || typeof e[k] === "boolean" || e[k] == null)).slice(0, 40) : [];
      setFields(fs);
      const { data: policies } = await cms.entries.list<any>(FP_UID, { pageSize: 1, filter: [{ field: "role", op: "eq", value: rl }, { field: "contentType", op: "eq", value: ct }] });
      const p = policies[0];
      if (p) { setPolicyId(p.documentId ?? p.id); setHidden(new Set(Array.isArray(p.hidden) ? p.hidden : [])); setReadonly(new Set(Array.isArray(p.readonly) ? p.readonly : [])); }
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { loadFor(role, ctype); }, [role, ctype, loadFor]);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, f: string) { const n = new Set(set); if (n.has(f)) n.delete(f); else n.add(f); setter(n); }

  async function save() {
    if (!role || !ctype) return;
    const body: any = { role, contentType: ctype, hidden: [...hidden], readonly: [...readonly] };
    try {
      if (policyId) await cms.entries.update(FP_UID, policyId, body);
      else { const e: any = await cms.entries.create(FP_UID, body); if (e?.documentId) setPolicyId(e.documentId); }
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
