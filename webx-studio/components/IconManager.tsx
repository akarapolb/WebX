"use client";
// Custom icon uploads — same tenant-or-global $or list/save shape as
// BlockTypeEditor.tsx (that file's own comments explain why the raw fetch
// is needed instead of the cms.entries adapter: EntryQuery can't express
// an OR filter). Deliberately simpler than BlockTypeEditor: one upload
// field, no fieldsSchema/template builder.
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";

export type CustomIcon = { docId: string; key: string; name: string; imageUrl?: string; tenantKey?: string };

const ICON_UID = "api::icon.icon";
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const mediaSrc = (url: string) => (url.startsWith("http") ? url : "/api/strapi" + url);

export default function IconManager({ tenantKey, onClose, onSaved }: { tenantKey?: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const [list, setList] = useState<CustomIcon[]>([]);
  const [cur, setCur] = useState<{ docId?: string; key: string; name: string; imageUrl?: string; newId?: number } | null>(null);
  const [tenantDoc, setTenantDoc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const mapIcon = (e: any): CustomIcon => ({ docId: String(e.documentId ?? e.id), key: e.key, name: e.name, imageUrl: e.image?.url, tenantKey: e.tenant?.key });

  const load = async () => {
    try {
      let qs = "?pageSize=100&sort=updatedAt:DESC&populate=image&populate=tenant";
      if (tenantKey) qs += "&filters[$or][0][tenant][key][$eq]=" + encodeURIComponent(tenantKey) + "&filters[$or][1][tenant][id][$null]=true";
      const r = await fetch("/api/strapi/content-manager/collection-types/" + ICON_UID + qs);
      if (!r.ok) return;
      const j = await r.json();
      setList((j.results ?? j.data ?? []).map(mapIcon));
    } catch {}
  };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);
  useEffect(() => {
    if (!tenantKey) return;
    cms.entries.list("api::tenant.tenant", { pageSize: 1, filter: [{ field: "key", op: "eq", value: tenantKey }] })
      .then(({ data }) => { const tn = data[0]; if (tn) setTenantDoc(String((tn as any).documentId ?? (tn as any).id)); }).catch(() => {});
  }, [tenantKey]);

  async function uploadImage(file: File) {
    setUploading(true); setMsg(null);
    try {
      const asset = await cms.media.upload(file);
      setCur((c) => ({ ...(c as any), imageUrl: asset.url, newId: asset.id }));
    } catch { setMsg({ t: "Upload failed", ok: false }); }
    finally { setUploading(false); }
  }

  async function save() {
    if (!cur) return;
    const key = cur.key || slug(cur.name) || "icon-" + Math.random().toString(36).slice(2, 8);
    const body: any = { name: cur.name || key, key };
    if (cur.newId) body.image = cur.newId;
    if (tenantDoc && !cur.docId) body.tenant = tenantDoc;
    setSaving(true); setMsg(null);
    try {
      if (cur.docId) await cms.entries.update(ICON_UID, cur.docId, body);
      else {
        if (!cur.newId) { setMsg({ t: "Upload an image first", ok: false }); setSaving(false); return; }
        await cms.entries.create(ICON_UID, body);
      }
      setMsg({ t: t("bt.saved"), ok: true }); await load(); onSaved(); setCur(null);
    } catch (e) {
      if (e instanceof CmsError) setMsg({ t: "Save failed (HTTP " + e.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setSaving(false); }
  }

  async function remove(ic: CustomIcon) {
    try { await cms.entries.remove(ICON_UID, ic.docId); await load(); onSaved(); if (cur?.docId === ic.docId) setCur(null); } catch {}
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bt-modal">
        <div className="ovhead"><h3 style={{ flex: 1 }}>{t("ic.manage")}</h3><button className="ic-btn" onClick={onClose}><Icon name="close" /></button></div>
        <div className="bt-body">
          <aside className="bt-list">
            <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }} onClick={() => setCur({ key: "", name: "" })}><Icon name="plus" />{t("ic.new")}</button>
            {list.length === 0 && <div className="muted" style={{ fontSize: 11.5, padding: 8 }}>{t("ic.empty")}</div>}
            {list.map((ic) => (
              <button key={ic.docId} className={"ctype" + (cur?.docId === ic.docId ? " on" : "")} onClick={() => setCur({ docId: ic.docId, key: ic.key, name: ic.name, imageUrl: ic.imageUrl })}>
                {ic.imageUrl ? <img src={mediaSrc(ic.imageUrl)} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} /> : <Icon name="img" />}
                <span>{ic.name}</span>
              </button>
            ))}
          </aside>

          <div className="bt-form">
            {!cur ? <div className="muted" style={{ padding: 30, textAlign: "center" }}>{t("ic.empty")}</div> : (
              <>
                <div className="fld"><label>{t("bt.name")}</label><input value={cur.name} onChange={(e) => setCur((c) => ({ ...(c as any), name: e.target.value }))} placeholder="Handshake, Ambulance…" /></div>
                <div className="fld">
                  <label>{t("ic.image")}</label>
                  <div className="ed-media">
                    {cur.imageUrl ? <img className="ed-img" src={mediaSrc(cur.imageUrl)} alt="" /> : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                    <label className="btn btn--g" style={{ cursor: "pointer" }}>
                      <Icon name="img" />{uploading ? t("m.uploading") : t("m.change")}
                      <input type="file" accept="image/*" hidden disabled={uploading} onChange={(ev) => ev.target.files?.[0] && uploadImage(ev.target.files[0])} />
                    </label>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                  <button className="btn btn--p" onClick={save} disabled={saving || !cur.name.trim()}>{saving ? t("bt.saving") : t("bt.save")}</button>
                  {cur.docId && <button className="btn btn--g" style={{ color: "var(--bad)", borderColor: "var(--bad)" }} onClick={() => remove(list.find((x) => x.docId === cur.docId)!)}><Icon name="trash" />{t("e.delete")}</button>}
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
