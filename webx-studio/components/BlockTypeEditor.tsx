"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";

export type BlockType = { docId?: string; key: string; name: string; icon?: string; fieldsSchema?: Field[]; template?: string; tenantKey?: string };
type Field = { key: string; label?: string; type: "text" | "textarea" | "richtext" | "image" };

const BT_UID = "api::block-type.block-type";
const ICONS = ["layout", "doc", "cta", "img", "grid", "star", "msg", "spark", "code"];
const FTYPES: Field["type"][] = ["text", "textarea", "richtext", "image"];
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default function BlockTypeEditor({ tenantKey, onClose, onSaved }: { tenantKey?: string; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const [list, setList] = useState<BlockType[]>([]);
  const [cur, setCur] = useState<BlockType | null>(null);
  const [tenantDoc, setTenantDoc] = useState<string | null>(null);
  const [market, setMarket] = useState<BlockType[]>([]);
  const [showMarket, setShowMarket] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const mapBt = (e: any): BlockType => ({ docId: String(e.documentId ?? e.id), key: e.key, name: e.name, icon: e.icon, fieldsSchema: e.fieldsSchema || [], template: e.template || "", tenantKey: e.tenant?.key });
  // marketplace: every block type across tenants (+ global), to install into this workspace
  const loadMarket = async () => {
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + BT_UID + "?pageSize=100&sort=updatedAt:DESC&populate=tenant");
      if (!r.ok) return;
      const j = await r.json();
      setMarket((j.results ?? j.data ?? []).map(mapBt));
    } catch {}
  };
  async function install(bt: BlockType) {
    const key = (bt.key || "block").replace(/-[a-z0-9]{3,6}$/, "") + "-" + Math.random().toString(36).slice(2, 5);
    const body: any = { name: bt.name, key, icon: bt.icon || "grid", fieldsSchema: bt.fieldsSchema || [], template: bt.template || "" };
    if (tenantDoc) body.tenant = tenantDoc;
    try { const r = await fetch("/api/strapi/content-manager/collection-types/" + BT_UID, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (r.ok) { setMsg({ t: t("bt.saved"), ok: true }); await load(); onSaved(); } } catch {}
  }
  async function shareGlobal() {
    if (!cur?.docId) return;
    try { const r = await fetch("/api/strapi/content-manager/collection-types/" + BT_UID + "/" + cur.docId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant: null }) }); if (r.ok) { setMsg({ t: t("bt.shared"), ok: true }); await load(); onSaved(); } } catch {}
  }

  const load = async () => {
    try {
      let qs = "?pageSize=100&sort=updatedAt:DESC";
      if (tenantKey) qs += "&filters[$or][0][tenant][key][$eq]=" + encodeURIComponent(tenantKey) + "&filters[$or][1][tenant][id][$null]=true";
      const r = await fetch("/api/strapi/content-manager/collection-types/" + BT_UID + qs);
      if (!r.ok) return;
      const j = await r.json();
      setList((j.results ?? j.data ?? []).map(mapBt));
    } catch {}
  };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);
  // resolve the current tenant's documentId so new block types are scoped to it
  useEffect(() => {
    if (!tenantKey) return;
    fetch("/api/strapi/content-manager/collection-types/api::tenant.tenant?pageSize=1&filters[key][$eq]=" + encodeURIComponent(tenantKey))
      .then((r) => (r.ok ? r.json() : null)).then((j) => { const tn = (j?.results ?? j?.data ?? [])[0]; if (tn) setTenantDoc(String(tn.documentId ?? tn.id)); }).catch(() => {});
  }, [tenantKey]);

  const blank = (): BlockType => ({ key: "", name: "", icon: "grid", fieldsSchema: [{ key: "heading", label: "Heading", type: "text" }], template: "<section style=\"padding:40px;text-align:center\">\n  <h2>{{heading}}</h2>\n</section>" });
  const setF = (patch: Partial<BlockType>) => setCur((c) => ({ ...(c as BlockType), ...patch }));
  const setField = (i: number, patch: Partial<Field>) => setCur((c) => ({ ...(c as BlockType), fieldsSchema: (c!.fieldsSchema || []).map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const addField = () => setCur((c) => ({ ...(c as BlockType), fieldsSchema: [...(c!.fieldsSchema || []), { key: "field" + ((c!.fieldsSchema || []).length + 1), label: "", type: "text" }] }));
  const rmField = (i: number) => setCur((c) => ({ ...(c as BlockType), fieldsSchema: (c!.fieldsSchema || []).filter((_, j) => j !== i) }));

  async function save() {
    if (!cur) return;
    setSaving(true); setMsg(null);
    const key = cur.key || slug(cur.name) || "blocktype-" + Math.random().toString(36).slice(2, 8);
    const body: any = { name: cur.name || key, key, icon: cur.icon || "grid", fieldsSchema: cur.fieldsSchema || [], template: cur.template || "" };
    if (tenantDoc && !cur.docId) body.tenant = tenantDoc;
    try {
      const url = "/api/strapi/content-manager/collection-types/" + BT_UID + (cur.docId ? "/" + cur.docId : "");
      const r = await fetch(url, { method: cur.docId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) { setMsg({ t: t("bt.saved"), ok: true }); await load(); onSaved(); const j = await r.json().catch(() => null); const e = j?.data ?? j; if (e) setCur({ docId: String(e.documentId ?? e.id), key: e.key, name: e.name, icon: e.icon, fieldsSchema: e.fieldsSchema || [], template: e.template || "" }); }
      else setMsg({ t: "Save failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  const placeholders = (cur?.fieldsSchema || []).map((f) => "{{" + f.key + "}}").join("  ");

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bt-modal">
        <div className="ovhead"><h3 style={{ flex: 1 }}>{t("vb.manage")}</h3><button className="ic-btn" onClick={onClose}><Icon name="close" /></button></div>
        <div className="bt-body">
          <aside className="bt-list">
            <div className="seg" style={{ marginBottom: 10 }}>
              <button className={!showMarket ? "on" : ""} onClick={() => setShowMarket(false)}>{t("bt.mine")}</button>
              <button className={showMarket ? "on" : ""} onClick={() => { setShowMarket(true); loadMarket(); }}>{t("bt.market")}</button>
            </div>
            {!showMarket ? (
              <>
                <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }} onClick={() => setCur(blank())}><Icon name="plus" />{t("vb.newtype")}</button>
                {list.length === 0 && <div className="muted" style={{ fontSize: 11.5, padding: 8 }}>{t("bt.empty")}</div>}
                {list.map((b) => (
                  <button key={b.docId} className={"ctype" + (cur?.docId === b.docId ? " on" : "")} onClick={() => setCur(b)}>
                    <Icon name={b.icon || "grid"} /><span>{b.name}</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                {market.length === 0 && <div className="muted" style={{ fontSize: 11.5, padding: 8 }}>{t("bt.marketempty")}</div>}
                {market.map((b) => {
                  const have = list.some((x) => x.key === b.key);
                  return (
                    <div className="bt-market-row" key={b.docId}>
                      <Icon name={b.icon || "grid"} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{b.name}</b>
                        <div className="muted" style={{ fontSize: 10 }}>{b.tenantKey ? t("bt.from") + " " + b.tenantKey : t("bt.global")}</div>
                      </div>
                      <button className="bt-install" disabled={have} onClick={() => install(b)}>{have ? t("bt.installed") : t("bt.install")}</button>
                    </div>
                  );
                })}
              </>
            )}
          </aside>

          <div className="bt-form">
            {!cur ? <div className="muted" style={{ padding: 30, textAlign: "center" }}>{t("bt.empty")}</div> : (
              <>
                <div className="fld"><label>{t("bt.name")}</label><input value={cur.name} onChange={(e) => setF({ name: e.target.value })} placeholder="Pricing, Testimonial…" /></div>
                <div className="fld">
                  <label>{t("bt.icon")}</label>
                  <div className="bt-icons">{ICONS.map((ic) => <button key={ic} className={cur.icon === ic ? "on" : ""} onClick={() => setF({ icon: ic })}><Icon name={ic} /></button>)}</div>
                </div>
                <div className="fld">
                  <label>{t("bt.fields")}</label>
                  {(cur.fieldsSchema || []).map((f, i) => (
                    <div className="bt-frow" key={i}>
                      <input value={f.key} placeholder={t("bt.fkey")} onChange={(e) => setField(i, { key: e.target.value })} style={{ flex: 1 }} />
                      <input value={f.label || ""} placeholder={t("bt.flabel")} onChange={(e) => setField(i, { label: e.target.value })} style={{ flex: 1 }} />
                      <select value={f.type} onChange={(e) => setField(i, { type: e.target.value as Field["type"] })}>
                        {FTYPES.map((ft) => <option key={ft} value={ft}>{t("bt.t_" + ft)}</option>)}
                      </select>
                      <button className="rm" onClick={() => rmField(i)}><Icon name="trash" /></button>
                    </div>
                  ))}
                  <button className="vb-add-btn" style={{ marginTop: 4 }} onClick={addField}><Icon name="plus" />{t("bt.addfield")}</button>
                </div>
                <div className="fld">
                  <label>{t("bt.template")}</label>
                  <textarea value={cur.template} onChange={(e) => setF({ template: e.target.value })} style={{ minHeight: 130, fontFamily: "var(--mono)", fontSize: 12 }} />
                  <div className="muted" style={{ fontSize: 11, marginTop: 5 }}>{t("bt.thint")} <span className="mono" style={{ color: "var(--accent)" }}>{placeholders}</span></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                  <button className="btn btn--p" onClick={save} disabled={saving || !cur.name.trim()}>{saving ? t("bt.saving") : t("bt.save")}</button>
                  {cur.docId && <button className="btn btn--g" onClick={shareGlobal}><Icon name="users" />{t("bt.shareglobal")}</button>}
                  {msg && <span className={"toast-in " + (msg.ok ? "ok" : "bad")}>{msg.t}</span>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
