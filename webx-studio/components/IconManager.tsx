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
import { sanitizeIconSvg, safeViewBox } from "@/lib/iconSvg";
import MuiIconBrowser from "./MuiIconBrowser";

// `svg` is the inner markup of an icon stored inline (imported .svg, or a
// pick from the Material set) — preferred over `imageUrl` when both exist,
// because it inherits the template's own colour and scales cleanly.
export type CustomIcon = { docId: string; key: string; name: string; imageUrl?: string; svg?: string; viewBox?: string; tenantKey?: string };

const ICON_UID = "api::icon.icon";
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const mediaSrc = (url: string) => (url.startsWith("http") ? url : "/api/strapi" + url);

export default function IconManager({ tenantKey, onClose, onSaved }: { tenantKey?: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const [list, setList] = useState<CustomIcon[]>([]);
  const [cur, setCur] = useState<{ docId?: string; key: string; name: string; imageUrl?: string; svg?: string; viewBox?: string; newId?: number } | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [tenantDoc, setTenantDoc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const mapIcon = (e: any): CustomIcon => ({ docId: String(e.documentId ?? e.id), key: e.key, name: e.name, imageUrl: e.image?.url, svg: e.svg || undefined, viewBox: e.viewBox || undefined, tenantKey: e.tenant?.key });

  // Through cms.entries rather than a raw /api/strapi/... fetch, which needs a
  // Strapi bearer token a WordPress session does not have — it 401ed, so the
  // list was always empty for ORST/RoyalSociety. Governance scopes the rows
  // to the caller's own workspace, so there is no tenant filter to build.
  const load = async () => {
    try {
      const { data } = await cms.entries.list<any>(ICON_UID, { pageSize: 100, sort: "updatedAt:DESC" });
      setList(data.map(mapIcon));
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

  /**
   * Import a .svg file as an inline icon. Sanitised here as well as on the
   * render side — this copy is what stops unusable markup being stored at all,
   * and gives the editor an error now rather than a blank icon later.
   */
  async function importSvg(file: File) {
    setUploading(true); setMsg(null);
    try {
      if (file.size > 256 * 1024) { setMsg({ t: t("ic.svgbig"), ok: false }); return; }
      const text = await file.text();
      const svg = sanitizeIconSvg(text);
      if (!svg) { setMsg({ t: t("ic.svgbad"), ok: false }); return; }
      // The source file's own viewBox decides how the paths are scaled;
      // without it a 48-unit icon would be cropped to a 24-unit box.
      const vb = safeViewBox(text.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1]);
      const base = file.name.replace(/\.svg$/i, "");
      setCur((c) => ({ ...(c as any), svg, viewBox: vb, imageUrl: undefined, newId: undefined, name: (c?.name || base) }));
    } catch { setMsg({ t: t("ic.svgbad"), ok: false }); }
    finally { setUploading(false); }
  }

  async function save() {
    if (!cur) return;
    const key = cur.key || slug(cur.name) || "icon-" + Math.random().toString(36).slice(2, 8);
    const body: any = { name: cur.name || key, key };
    if (cur.newId) body.image = cur.newId;
    // Sent even when empty so switching an existing icon from inline SVG back
    // to an uploaded image actually clears the old markup.
    body.svg = cur.svg || null;
    body.viewBox = cur.svg ? (cur.viewBox || "0 0 24 24") : null;
    if (tenantDoc && !cur.docId) body.tenant = tenantDoc;
    setSaving(true); setMsg(null);
    try {
      if (cur.docId) await cms.entries.update(ICON_UID, cur.docId, body);
      else {
        if (!cur.newId && !cur.svg) { setMsg({ t: t("ic.needart"), ok: false }); setSaving(false); return; }
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
              <button key={ic.docId} className={"ctype" + (cur?.docId === ic.docId ? " on" : "")} onClick={() => setCur({ docId: ic.docId, key: ic.key, name: ic.name, imageUrl: ic.imageUrl, svg: ic.svg, viewBox: ic.viewBox })}>
                {ic.svg ? <svg className="ic-svg" style={{ width: 16, height: 16 }} viewBox={ic.viewBox || "0 0 24 24"} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ic.svg }} /> : ic.imageUrl ? <img src={mediaSrc(ic.imageUrl)} alt="" style={{ width: 16, height: 16, objectFit: "contain" }} /> : <Icon name="img" />}
                <span>{ic.name}</span>
              </button>
            ))}
          </aside>

          <div className="bt-form">
            {!cur ? <div className="muted" style={{ padding: 30, textAlign: "center" }}>{t("ic.empty")}</div> : (
              <>
                <div className="fld"><label>{t("bt.name")}</label><input value={cur.name} onChange={(e) => setCur((c) => ({ ...(c as any), name: e.target.value }))} placeholder="Handshake, Ambulance…" /></div>
                <div className="fld">
                  <label>{t("ic.artwork")}</label>
                  <div className="ed-media">
                    {/* Inline SVG wins over an uploaded image when both are
                        set: it takes the template's own colour and stays sharp
                        at any size, which an <img> cannot. */}
                    {cur.svg
                      ? <svg className="ed-img ic-svg" viewBox={cur.viewBox || "0 0 24 24"} aria-hidden="true" dangerouslySetInnerHTML={{ __html: cur.svg }} />
                      : cur.imageUrl ? <img className="ed-img" src={mediaSrc(cur.imageUrl)} alt="" />
                      : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                    <div className="ic-src">
                      <button className="btn btn--g" onClick={() => setBrowsing(true)}><Icon name="grid" />{t("ic.frommui")}</button>
                      <label className="btn btn--g" style={{ cursor: "pointer" }}>
                        <Icon name="plus" />{uploading ? t("m.uploading") : t("ic.importsvg")}
                        <input type="file" accept=".svg,image/svg+xml" hidden disabled={uploading}
                          onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) importSvg(f); }} />
                      </label>
                      <label className="btn btn--g" style={{ cursor: "pointer" }}>
                        <Icon name="img" />{t("ic.uploadimg")}
                        <input type="file" accept="image/*" hidden disabled={uploading}
                          onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) uploadImage(f); }} />
                      </label>
                      {cur.svg && <button className="btn btn--g" onClick={() => setCur((c) => ({ ...(c as any), svg: undefined, viewBox: undefined }))}><Icon name="trash" />{t("ic.clearsvg")}</button>}
                    </div>
                  </div>
                  {browsing && (
                    <MuiIconBrowser onClose={() => setBrowsing(false)}
                      onPick={(p) => {
                        setBrowsing(false);
                        setCur((c) => ({
                          ...(c as any),
                          svg: p.svg, viewBox: p.viewBox,
                          imageUrl: undefined, newId: undefined,
                          // Only names the icon when the editor hasn't; renaming
                          // their own icon out from under them would be rude.
                          name: c?.name?.trim() ? c.name : p.name,
                        }));
                      }} />
                  )}
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
