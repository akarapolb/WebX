"use client";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";

export type BlockType = { docId?: string; key: string; name: string; icon?: string; fieldsSchema?: Field[]; template?: string; tenantKey?: string; visualElements?: Elem[] | null };
type Field = { key: string; label?: string; type: "text" | "textarea" | "richtext" | "image" };
// Visual-mode composer's own data — a flat, ordered, non-nested list (see
// the plan's Design section for why: interpolate() has no layout model, so
// staying flat/non-nested is what keeps this tractable rather than
// reinventing a full freeform designer). Persisted verbatim as authoring
// metadata (visualElements) alongside the fieldsSchema/template it
// generates — the renderer never reads this, only this editor does, which
// is what lets a visually-built type reload into Visual mode exactly as
// left without ever having to parse HTML back into elements.
// Layout-only kinds (divider/spacer) contribute NO field to fieldsSchema —
// they're pure structure, so an instance editor never sees a control for
// them, which is the whole point of having them.
type ElemKind = "heading" | "paragraph" | "richtext" | "image" | "button" | "quote" | "badge" | "divider" | "spacer";
/** Per-element settings. Kept to a handful of enums that only ever affect
 * the generated HTML (heading level, button style, spacer height, image
 * width, alignment) — every value maps to inline styles or classes the
 * public site already ships, so a new option can never require a CSS deploy
 * to look right. */
type ElemOpts = { level?: "h2" | "h3" | "h4"; variant?: "primary" | "ghost"; size?: "sm" | "md" | "lg"; align?: "left" | "center"; width?: "full" | "half" };
type Elem = { id: string; kind: ElemKind; opts?: ElemOpts };

const BT_UID = "api::block-type.block-type";
const ICONS = ["layout", "doc", "cta", "img", "grid", "star", "msg", "spark", "code"];
const FTYPES: Field["type"][] = ["text", "textarea", "richtext", "image"];
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const PREFABS: { kind: ElemKind; icon: string; labelKey: string }[] = [
  { kind: "heading", icon: "layout", labelKey: "bt.el_heading" },
  { kind: "paragraph", icon: "doc", labelKey: "bt.el_paragraph" },
  { kind: "richtext", icon: "doc", labelKey: "bt.el_richtext" },
  { kind: "image", icon: "img", labelKey: "bt.el_image" },
  { kind: "button", icon: "check", labelKey: "bt.el_button" },
  { kind: "quote", icon: "msg", labelKey: "bt.el_quote" },
  { kind: "badge", icon: "star", labelKey: "bt.el_badge" },
  { kind: "divider", icon: "grid", labelKey: "bt.el_divider" },
  { kind: "spacer", icon: "layout", labelKey: "bt.el_spacer" },
];
/** Which option controls a kind actually has — drives the per-element
 * settings row below, so a divider never shows a "heading level" select. */
const OPTS_FOR: Record<ElemKind, (keyof ElemOpts)[]> = {
  heading: ["level", "align"], paragraph: ["align"], richtext: [], image: ["width"],
  button: ["variant", "align"], quote: [], badge: [], divider: [], spacer: ["size"],
};
const OPT_CHOICES: Record<keyof ElemOpts, string[]> = {
  level: ["h2", "h3", "h4"], variant: ["primary", "ghost"], size: ["sm", "md", "lg"],
  align: ["left", "center"], width: ["full", "half"],
};
const SPACER_PX: Record<string, number> = { sm: 12, md: 28, lg: 56 };
const prefabOf = (kind: ElemKind) => PREFABS.find((p) => p.kind === kind)!;
const newElemId = (kind: ElemKind) => kind + "_" + Math.random().toString(36).slice(2, 8);

// Pure generators: elems -> the same fieldsSchema/template shape a
// hand-written block type already has. Everything downstream (instance
// editing in VisualBuilder.tsx, all three interpolate() copies, the
// marketplace/install/share-global flow) only ever sees this output — it
// has no idea whether a type was built visually or by hand.
// `t` is the instance-editor-facing label text, not an i18n key — a
// translated string, passed in from the component (called at save time,
// where the current-language `t()` is in scope).
function elemsToFieldsSchema(elems: Elem[], t: (key: string) => string): Field[] {
  return elems.flatMap((el): Field[] => {
    if (el.kind === "button") return [
      { key: el.id + "_label", label: t("bt.el_buttonlabel"), type: "text" },
      { key: el.id + "_url", label: t("bt.el_buttonurl"), type: "text" },
    ];
    if (el.kind === "quote") return [
      { key: el.id, label: t("bt.el_quote"), type: "textarea" },
      { key: el.id + "_by", label: t("bt.el_quoteby"), type: "text" },
    ];
    // Structure only — no instance-editable value, so no field at all.
    if (el.kind === "divider" || el.kind === "spacer") return [];
    const type: Field["type"] = el.kind === "paragraph" ? "textarea" : el.kind === "richtext" ? "richtext" : el.kind === "image" ? "image" : "text";
    return [{ key: el.id, label: t(prefabOf(el.kind).labelKey), type }];
  });
}
// Everything below emits either inline styles or classes the public site's
// own design system already defines (.btn/.btn--primary) — deliberately
// nothing that would need a new stylesheet shipped for a custom block to
// look right, since these templates render inside three separate renderers
// (see this file's header) with no shared CSS of their own.
function elemsToTemplate(elems: Elem[]): string {
  return elems.map((el) => {
    const o = el.opts || {};
    const align = o.align === "center" ? "text-align:center;" : "";
    if (el.kind === "heading") { const h = o.level || "h2"; return `<${h} style="${align}">{{${el.id}}}</${h}>`; }
    if (el.kind === "paragraph") return `<p style="${align}">{{${el.id}}}</p>`;
    if (el.kind === "richtext") return `{{${el.id}}}`;
    if (el.kind === "image") return `<img src="{{${el.id}}}" alt="" style="max-width:${o.width === "half" ? "50%" : "100%"};height:auto" />`;
    if (el.kind === "quote") return `<blockquote style="margin:16px 0;padding:10px 0 10px 16px;border-left:3px solid currentColor;opacity:.9"><p style="margin:0">{{${el.id}}}</p><footer style="margin-top:6px;font-size:.9em;opacity:.75">{{${el.id}_by}}</footer></blockquote>`;
    if (el.kind === "badge") return `<span style="display:inline-block;padding:4px 10px;border-radius:99px;background:rgba(127,127,127,.14);font-size:12px;font-weight:600">{{${el.id}}}</span>`;
    if (el.kind === "divider") return `<hr style="border:0;border-top:1px solid rgba(127,127,127,.28);margin:20px 0" />`;
    if (el.kind === "spacer") return `<div style="height:${SPACER_PX[o.size || "md"]}px" aria-hidden="true"></div>`;
    return `<div style="${align}"><a class="btn btn--${o.variant || "primary"}" href="{{${el.id}_url}}">{{${el.id}_label}}</a></div>`;
  }).join("\n");
}

// Live preview of the block being designed, rendered with the PUBLIC site's
// own stylesheet so `.btn--primary` (and anything else the generated
// template leans on) looks the way it actually will. Isolated in an iframe
// for the same reason RealPreview.tsx is: public-site's CSS and this admin's
// CSS both define unscoped rules that would clobber each other in one
// document.
const PUBLIC_SITE = (process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || "http://localhost:3100").replace(/\/$/, "");
const SAMPLE_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#e6e8ee"/><path d="M118 118l30-38 24 30 16-18 34 26z" fill="#b9bfcd"/><circle cx="112" cy="66" r="13" fill="#b9bfcd"/></svg>`
  );
/** Fills the generated template with each field's own LABEL rather than
 * invented copy — the point of this preview is where things sit and how big
 * they are, and a label ("Heading", "Button link") says which control on the
 * instance editor feeds that slot. Not a 4th copy of interpolate(): it does
 * no escaping (every value here is ours, not user input) and substitutes a
 * placeholder image instead of resolving a media relation. */
function previewHtml(elems: Elem[], t: (key: string) => string): string {
  let html = elemsToTemplate(elems);
  for (const f of elemsToFieldsSchema(elems, t)) {
    const v = f.type === "image" ? SAMPLE_IMG : f.type === "richtext" ? `<p>${f.label || f.key}</p>` : (f.label || f.key);
    html = html.split("{{" + f.key + "}}").join(v);
  }
  return html;
}
const previewDoc = (body: string) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8" />` +
  `<link rel="stylesheet" href="${PUBLIC_SITE}/assets/design-system.css" />` +
  `<style>body{margin:0;padding:18px;background:#fff;color:#16181d;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.55}` +
  `img{max-width:100%}h2,h3,h4{margin:.4em 0}p{margin:.5em 0}</style>` +
  `</head><body>${body}</body></html>`;

export default function BlockTypeEditor({ tenantKey, onClose, onSaved }: { tenantKey?: string; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const [list, setList] = useState<BlockType[]>([]);
  const [cur, setCur] = useState<BlockType | null>(null);
  const [tenantDoc, setTenantDoc] = useState<string | null>(null);
  const [market, setMarket] = useState<BlockType[]>([]);
  const [showMarket, setShowMarket] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [mode, setMode] = useState<"visual" | "advanced">("visual");
  const [elems, setElems] = useState<Elem[]>([]);
  const [dragNewElem, setDragNewElem] = useState<ElemKind | null>(null);
  const [dragElemI, setDragElemI] = useState<number>(-1);
  const [dropElemAt, setDropElemAt] = useState<number>(-1);

  const mapBt = (e: any): BlockType => ({ docId: String(e.documentId ?? e.id), key: e.key, name: e.name, icon: e.icon, fieldsSchema: e.fieldsSchema || [], template: e.template || "", tenantKey: e.tenant?.key, visualElements: e.visualElements || null });
  // marketplace: every block type across tenants (+ global), to install into this workspace
  // NOTE: needs populate=tenant to show provenance; CmsAdapter's EntryQuery has no populate
  // support, so this stays a raw fetch (see migration report).
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
    const body: any = { name: bt.name, key, icon: bt.icon || "grid", fieldsSchema: bt.fieldsSchema || [], template: bt.template || "", visualElements: bt.visualElements || null };
    if (tenantDoc) body.tenant = tenantDoc;
    try { await cms.entries.create(BT_UID, body); setMsg({ t: t("bt.saved"), ok: true }); await load(); onSaved(); } catch {}
  }
  /** Removing a type does NOT touch pages that already placed it — those
   * blocks keep their stored props and simply render as "Unknown block"
   * (VisualBuilder's preview() and both public renderers already handle a
   * missing typeKey that way), so this is safe but not silent. */
  async function removeType() {
    if (!cur?.docId || !window.confirm(t("bt.confirmdel"))) return;
    try { await cms.entries.remove(BT_UID, cur.docId); setCur(null); setMsg({ t: t("bt.deleted"), ok: true }); await load(); onSaved(); }
    catch { setMsg({ t: "Could not delete this block type.", ok: false }); }
  }
  async function shareGlobal() {
    if (!cur?.docId) return;
    try { await cms.entries.update(BT_UID, cur.docId, { tenant: null }); setMsg({ t: t("bt.shared"), ok: true }); await load(); onSaved(); } catch {}
  }

  // NOTE: needs an OR filter (tenant.key = X OR tenant.id is null) which
  // CmsAdapter's EntryQuery can't express (flat AND-only filters, no $null op),
  // so this stays a raw fetch (see migration report).
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
    cms.entries.list("api::tenant.tenant", { pageSize: 1, filter: [{ field: "key", op: "eq", value: tenantKey }] })
      .then(({ data }) => { const tn = data[0]; if (tn) setTenantDoc(String((tn as any).documentId ?? (tn as any).id)); }).catch(() => {});
  }, [tenantKey]);

  const blank = (): BlockType => ({ key: "", name: "", icon: "grid", fieldsSchema: [], template: "" });
  function openType(b: BlockType | null) {
    setCur(b);
    // b.docId, not just truthy b — blank() also returns a real (non-null)
    // object for a brand-new, never-saved type, which must still default to
    // Visual mode like any new type, not fall into the "existing hand-
    // written type" branch just because it's non-null.
    if (b?.visualElements?.length) { setMode("visual"); setElems(b.visualElements); }
    else if (b?.docId) { setMode("advanced"); setElems([]); }
    else { setMode("visual"); setElems([{ id: newElemId("heading"), kind: "heading" }]); }
  }
  function switchToVisual() {
    if (!elems.length && cur?.template) {
      if (!window.confirm(t("bt.visualwarn"))) return;
    }
    setMode("visual");
  }
  const setF = (patch: Partial<BlockType>) => setCur((c) => ({ ...(c as BlockType), ...patch }));
  const setField = (i: number, patch: Partial<Field>) => setCur((c) => ({ ...(c as BlockType), fieldsSchema: (c!.fieldsSchema || []).map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const addField = () => setCur((c) => ({ ...(c as BlockType), fieldsSchema: [...(c!.fieldsSchema || []), { key: "field" + ((c!.fieldsSchema || []).length + 1), label: "", type: "text" }] }));
  const rmField = (i: number) => setCur((c) => ({ ...(c as BlockType), fieldsSchema: (c!.fieldsSchema || []).filter((_, j) => j !== i) }));

  // ---- Visual composer: element list add/remove/reorder ----
  function addElemAt(idx: number, kind: ElemKind) {
    setElems((es) => { const n = [...es]; n.splice(idx, 0, { id: newElemId(kind), kind }); return n; });
    setDropElemAt(-1);
  }
  function rmElem(i: number) { setElems((es) => es.filter((_, j) => j !== i)); }
  function setElemOpt(i: number, k: keyof ElemOpts, v: string) {
    setElems((es) => es.map((e, j) => (j === i ? { ...e, opts: { ...(e.opts || {}), [k]: v } } : e)));
  }
  function moveElem(i: number, d: number) { setElems((es) => { const n = [...es]; const j = i + d; if (j < 0 || j >= n.length) return es; [n[i], n[j]] = [n[j], n[i]]; return n; }); }
  function reorderElem(from: number, to: number) { setElems((es) => { if (from === to || from < 0) return es; const n = [...es]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; }); }
  function handleElemDrop(idx: number) {
    if (dragElemI >= 0) { const to = idx > dragElemI ? idx - 1 : idx; reorderElem(dragElemI, to); }
    else if (dragNewElem) addElemAt(idx, dragNewElem);
    setDragNewElem(null); setDragElemI(-1); setDropElemAt(-1);
  }

  async function save() {
    if (!cur) return;
    setSaving(true); setMsg(null);
    const key = cur.key || slug(cur.name) || "blocktype-" + Math.random().toString(36).slice(2, 8);
    const fieldsSchema = mode === "visual" ? elemsToFieldsSchema(elems, t) : (cur.fieldsSchema || []);
    const template = mode === "visual" ? elemsToTemplate(elems) : (cur.template || "");
    const body: any = { name: cur.name || key, key, icon: cur.icon || "grid", fieldsSchema, template, visualElements: mode === "visual" ? elems : null };
    if (tenantDoc && !cur.docId) body.tenant = tenantDoc;
    try {
      const e: any = cur.docId ? await cms.entries.update(BT_UID, cur.docId, body) : await cms.entries.create(BT_UID, body);
      setMsg({ t: t("bt.saved"), ok: true }); await load(); onSaved();
      if (e) setCur({ docId: String(e.documentId ?? e.id), key: e.key, name: e.name, icon: e.icon, fieldsSchema: e.fieldsSchema || [], template: e.template || "", visualElements: e.visualElements || null });
    } catch (e) {
      if (e instanceof CmsError) setMsg({ t: "Save failed (HTTP " + e.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setSaving(false); }
  }

  const placeholders = (cur?.fieldsSchema || []).map((f) => "{{" + f.key + "}}").join("  ");

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bt-modal">
        <div className="ovhead"><h3 style={{ flex: 1 }}>{t("vb.manage")}</h3><button className="ic-btn" onClick={onClose}><Icon name="close" /></button></div>
        <div className={"bt-body" + (cur && mode === "visual" ? " with-pv" : "")}>
          <aside className="bt-list">
            <div className="seg" style={{ marginBottom: 10 }}>
              <button className={!showMarket ? "on" : ""} onClick={() => setShowMarket(false)}>{t("bt.mine")}</button>
              <button className={showMarket ? "on" : ""} onClick={() => { setShowMarket(true); loadMarket(); }}>{t("bt.market")}</button>
            </div>
            {!showMarket ? (
              <>
                <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }} onClick={() => openType(blank())}><Icon name="plus" />{t("vb.newtype")}</button>
                {list.length === 0 && <div className="muted" style={{ fontSize: 11.5, padding: 8 }}>{t("bt.empty")}</div>}
                {list.map((b) => (
                  <button key={b.docId} className={"ctype" + (cur?.docId === b.docId ? " on" : "")} onClick={() => openType(b)}>
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

                <div className="seg" style={{ marginBottom: 10 }}>
                  <button className={mode === "visual" ? "on" : ""} onClick={switchToVisual}>{t("bt.modevisual")}</button>
                  <button className={mode === "advanced" ? "on" : ""} onClick={() => setMode("advanced")}>{t("bt.modeadvanced")}</button>
                </div>

                {mode === "visual" ? (
                  <div className="fld">
                    <label>{t("bt.layout")}</label>
                    <div className="vb-add-grid" style={{ marginBottom: 10 }}>
                      {PREFABS.map((p) => (
                        <button key={p.kind} className="vb-add-btn" draggable
                          onDragStart={() => setDragNewElem(p.kind)}
                          onDragEnd={() => { setDragNewElem(null); setDropElemAt(-1); }}
                          onClick={() => addElemAt(elems.length, p.kind)}>
                          <Icon name={p.icon} />{t(p.labelKey)}
                        </button>
                      ))}
                    </div>
                    {elems.length === 0 && <div className="muted" style={{ fontSize: 11.5, padding: 8 }}>{t("bt.layoutempty")}</div>}
                    <div
                      className={"vbk-ins" + (dropElemAt === 0 ? " over" : "")}
                      onDragOver={(e) => { if (dragNewElem || dragElemI >= 0) { e.preventDefault(); setDropElemAt(0); } }}
                      onDragLeave={() => setDropElemAt((d) => (d === 0 ? -1 : d))}
                      onDrop={(e) => { e.preventDefault(); handleElemDrop(0); }}
                    />
                    {elems.map((el, i) => (
                      <div key={el.id}>
                        <div className="vb-item" draggable
                          onDragStart={() => setDragElemI(i)} onDragEnd={() => setDragElemI(-1)}
                          onDragOver={(e) => e.preventDefault()} onDrop={() => handleElemDrop(i)}>
                          <span className="vb-grip"><Icon name="drag" /></span>
                          <Icon name={prefabOf(el.kind).icon} />
                          <span style={{ flex: 1 }}>{t(prefabOf(el.kind).labelKey)}</span>
                          <button aria-label={t("a11y.moveup")} title={t("a11y.moveup")} onClick={() => moveElem(i, -1)} disabled={i === 0}>↑</button>
                          <button aria-label={t("a11y.movedown")} title={t("a11y.movedown")} onClick={() => moveElem(i, 1)} disabled={i === elems.length - 1}>↓</button>
                          <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmElem(i)}><Icon name="trash" /></button>
                        </div>
                        {/* Per-element settings — only the ones that kind
                            actually has (OPTS_FOR), so nothing shown here is
                            ever a no-op on the generated HTML. */}
                        {OPTS_FOR[el.kind].length > 0 && (
                          <div className="bt-elopts">
                            {OPTS_FOR[el.kind].map((k) => (
                              <select key={k} value={(el.opts?.[k] as string) || OPT_CHOICES[k][0]}
                                aria-label={t("bt.opt_" + k)} title={t("bt.opt_" + k)}
                                onChange={(e) => setElemOpt(i, k, e.target.value)}>
                                {OPT_CHOICES[k].map((c) => <option key={c} value={c}>{t("bt.opt_" + k)}: {c}</option>)}
                              </select>
                            ))}
                          </div>
                        )}
                        <div
                          className={"vbk-ins" + (dropElemAt === i + 1 ? " over" : "")}
                          onDragOver={(e) => { if (dragNewElem || dragElemI >= 0) { e.preventDefault(); setDropElemAt(i + 1); } }}
                          onDragLeave={() => setDropElemAt((d) => (d === i + 1 ? -1 : d))}
                          onDrop={(e) => { e.preventDefault(); handleElemDrop(i + 1); }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
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
                  </>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                  <button className="btn btn--p" onClick={save} disabled={saving || !cur.name.trim()}>{saving ? t("bt.saving") : t("bt.save")}</button>
                  {cur.docId && <button className="btn btn--g" onClick={shareGlobal}><Icon name="users" />{t("bt.shareglobal")}</button>}
                  {cur.docId && <button className="btn btn--g" onClick={removeType}><Icon name="trash" />{t("bt.delete")}</button>}
                  {msg && <span className={"toast-in " + (msg.ok ? "ok" : "bad")}>{msg.t}</span>}
                </div>
              </>
            )}
          </div>

          {/* Live preview — visual mode only. Advanced mode's own raw-HTML
              textarea is already its preview, and a second render of
              hand-written HTML there would just be a slower echo of it. */}
          {cur && mode === "visual" && (
            <div className="bt-pv">
              <div className="bt-pv-h"><Icon name="eye" />{t("bt.preview")}</div>
              <iframe title={t("bt.preview")} srcDoc={previewDoc(previewHtml(elems, t))} />
              <div className="muted" style={{ fontSize: 11 }}>{t("bt.previewhint")}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
