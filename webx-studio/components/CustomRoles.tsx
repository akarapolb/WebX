"use client";
import { Fragment, useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { cms } from "@/lib/cms";

type CType = { uid: string; label: string };
type Perm = { view?: boolean; create?: boolean; update?: boolean; delete?: boolean; publish?: boolean; embedCode?: boolean; hidden?: string[]; readonly?: string[] };
type Role = { roleKey: string; name: string; permissions: Record<string, Perm> };

const SYS = new Set(["id", "documentId", "createdAt", "updatedAt", "publishedAt", "locale", "status", "createdBy", "updatedBy", "localizations"]);
const ACTIONS: { key: keyof Perm; label: string }[] = [
  { key: "view", label: "View" }, { key: "create", label: "Create" }, { key: "update", label: "Update" },
  { key: "delete", label: "Delete" }, { key: "publish", label: "Publish" },
];
// The content types whose page-builder blocks can include a Custom Code
// block (raw HTML/CSS/JS) — governance.ts's create/update only enforces
// embedCode for these uids (see PAGE_LIKE_UIDS there), so the checkbox is
// only shown here. wp:page is WordPress-backed ORST/RoyalSociety pages.
const PAGE_LIKE = new Set(["api::page.page", "api::landing.landing", "wp:page"]);

export default function CustomRoles() {
  const { t } = useLang();
  const { currentKey } = useTenant();
  const tenant = currentKey && currentKey !== "workspace" ? currentKey : "";

  const [roles, setRoles] = useState<Role[]>([]);
  const [types, setTypes] = useState<CType[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null); // null while list-only; "" while creating new
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Record<string, Perm>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fieldsByType, setFieldsByType] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    if (!tenant) { setLoading(false); return; }
    setLoading(true);
    try {
      const [rolesRes, typesRes] = await Promise.all([
        fetch("/api/cms/roles?tenant=" + encodeURIComponent(tenant)).then((r) => (r.ok ? r.json() : [])),
        fetch("/api/cms/roles/content-types?tenant=" + encodeURIComponent(tenant)).then((r) => (r.ok ? r.json() : [])),
      ]);
      setRoles(Array.isArray(rolesRes) ? rolesRes : []);
      setTypes(Array.isArray(typesRes) ? typesRes : []);
    } catch {} finally { setLoading(false); }
  }, [tenant]);
  useEffect(() => { load(); }, [load]);

  function startCreate() { setEditingKey(""); setName(""); setPerms({}); setExpanded(null); setMsg(null); }
  function startEdit(r: Role) { setEditingKey(r.roleKey); setName(r.name); setPerms(r.permissions || {}); setExpanded(null); setMsg(null); }
  function cancel() { setEditingKey(null); }

  function setAction(uid: string, key: keyof Perm, val: boolean) {
    setPerms((p) => ({ ...p, [uid]: { ...p[uid], [key]: val } }));
  }
  function toggleField(uid: string, list: "hidden" | "readonly", field: string) {
    setPerms((p) => {
      const cur = new Set(p[uid]?.[list] || []);
      if (cur.has(field)) cur.delete(field); else cur.add(field);
      return { ...p, [uid]: { ...p[uid], [list]: [...cur] } };
    });
  }

  async function expandRow(uid: string) {
    setExpanded(expanded === uid ? null : uid);
    if (fieldsByType[uid]) return;
    try {
      const { data } = await cms.entries.list<any>(uid, { pageSize: 1 });
      const e = data[0];
      const fs = e ? Object.keys(e).filter((k) => !SYS.has(k) && (typeof e[k] === "string" || typeof e[k] === "number" || typeof e[k] === "boolean" || e[k] == null)).slice(0, 40) : [];
      setFieldsByType((prev) => ({ ...prev, [uid]: fs }));
    } catch { setFieldsByType((prev) => ({ ...prev, [uid]: [] })); }
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true); setMsg(null);
    try {
      const url = editingKey ? `/api/cms/roles/${encodeURIComponent(editingKey)}?tenant=${encodeURIComponent(tenant)}` : `/api/cms/roles?tenant=${encodeURIComponent(tenant)}`;
      const r = await fetch(url, {
        method: editingKey ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, permissions: perms }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ t: j.error || "Save failed", ok: false }); return; }
      setMsg({ t: t("cr.saved"), ok: true });
      setEditingKey(null);
      await load();
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  async function remove(roleKey: string) {
    setMsg(null);
    try {
      const r = await fetch(`/api/cms/roles/${encodeURIComponent(roleKey)}?tenant=${encodeURIComponent(tenant)}`, { method: "DELETE" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg({ t: j.error || "Delete failed", ok: false }); return; }
      await load();
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
  }

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.roles")}</h1><p>{t("cr.sub")}</p></div>
        {editingKey === null && (
          <div className="vh-act"><button className="btn btn--p" onClick={startCreate} disabled={!tenant}><Icon name="lock" />{t("cr.new")}</button></div>
        )}
      </div>

      {msg && <div className="panel" style={{ marginBottom: 14 }}><span className={"badge " + (msg.ok ? "b-ok" : "b-warn")}><span className="dot" />{msg.ok ? "OK" : "!"}</span><span style={{ marginLeft: 10, color: msg.ok ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{msg.t}</span></div>}

      {editingKey === null ? (
        loading ? (
          <div className="panel"><span className="muted">{t("cr.loading")}</span></div>
        ) : roles.length === 0 ? (
          <div className="panel"><span className="muted">{t("cr.none")}</span></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {roles.map((r) => (
              <div key={r.roleKey} className="panel" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <b>{r.name}</b>
                  <div className="muted mono" style={{ fontSize: 12 }}>{r.roleKey} · {Object.keys(r.permissions || {}).length} {t("cr.typesConfigured")}</div>
                </div>
                <button className="btn btn--g" onClick={() => startEdit(r)}>{t("cr.edit")}</button>
                <button className="btn btn--g" onClick={() => remove(r.roleKey)}><Icon name="trash" />{t("cr.delete")}</button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="panel" style={{ padding: 16 }}>
          <label className="vb-fld" style={{ marginBottom: 14 }}>
            <span>{t("cr.name")}</span>
            <input className="rv-assignee" style={{ width: "100%" }} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cr.namePh")} />
          </label>

          <table className="tbl">
            <thead>
              <tr>
                <th>{t("cr.contentType")}</th>
                {ACTIONS.map((a) => <th key={a.key} style={{ width: 70, textAlign: "center" }}>{a.label}</th>)}
                <th style={{ width: 90, textAlign: "center" }}>{t("cr.embedcode")}</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {types.map((ct) => {
                const p = perms[ct.uid] || {};
                const fields = fieldsByType[ct.uid] || [];
                return (
                  <Fragment key={ct.uid}>
                    <tr>
                      <td className="mono">{ct.label}</td>
                      {ACTIONS.map((a) => (
                        <td key={a.key} style={{ textAlign: "center" }}>
                          <input type="checkbox" checked={Boolean(p[a.key])} onChange={(e) => setAction(ct.uid, a.key, e.target.checked)} />
                        </td>
                      ))}
                      <td style={{ textAlign: "center" }}>
                        {PAGE_LIKE.has(ct.uid) && (
                          <input type="checkbox" checked={Boolean(p.embedCode)} onChange={(e) => setAction(ct.uid, "embedCode", e.target.checked)} title={t("cr.embedcodehint")} />
                        )}
                      </td>
                      <td>
                        <button type="button" className="btn btn--g" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => expandRow(ct.uid)}>
                          {expanded === ct.uid ? t("cr.hideFields") : t("cr.fields")}
                        </button>
                      </td>
                    </tr>
                    {expanded === ct.uid && (
                      <tr>
                        <td colSpan={ACTIONS.length + 3} style={{ background: "var(--panel-2, rgba(255,255,255,0.04))" }}>
                          {fields.length === 0 ? (
                            <div className="muted" style={{ padding: 8 }}>{t("fp.nofields")}</div>
                          ) : (
                            <table className="tbl" style={{ margin: "6px 0" }}>
                              <thead><tr><th>{t("fp.field")}</th><th style={{ width: 90, textAlign: "center" }}>{t("fp.hidden")}</th><th style={{ width: 90, textAlign: "center" }}>{t("fp.readonly")}</th></tr></thead>
                              <tbody>
                                {fields.map((f) => (
                                  <tr key={f}>
                                    <td className="mono">{f}</td>
                                    <td style={{ textAlign: "center" }}><input type="checkbox" checked={(p.hidden || []).includes(f)} onChange={() => toggleField(ct.uid, "hidden", f)} /></td>
                                    <td style={{ textAlign: "center" }}><input type="checkbox" checked={(p.readonly || []).includes(f)} onChange={() => toggleField(ct.uid, "readonly", f)} disabled={(p.hidden || []).includes(f)} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" className="btn btn--g" onClick={cancel} disabled={saving}>{t("e.cancel")}</button>
            <button type="button" className="btn btn--p" onClick={save} disabled={saving || !name.trim()}>{saving ? t("cr.saving") : t("cr.save")}</button>
          </div>
        </div>
      )}

      <div className="notice"><Icon name="shield" /> {t("cr.note")}</div>
    </>
  );
}
