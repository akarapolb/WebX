"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import RichText from "./RichText";
import InlineText from "./InlineText";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

type Block = Record<string, any> & { __component: string };
type Page = { docId: string; locale?: string; title: string };
type Device = "desktop" | "tablet" | "mobile";

const LANDING_UID = "api::landing.landing";
const TYPES = [
  { comp: "block.hero", key: "vb.hero", icon: "layout", fields: [{ k: "kicker" }, { k: "heading" }, { k: "subheading", ta: true }, { k: "ctaLabel" }, { k: "ctaUrl" }], def: { heading: "New hero", subheading: "Describe your offer here", ctaLabel: "Get started" } },
  { comp: "block.richtext", key: "vb.richtext", icon: "doc", fields: [{ k: "body", rich: true }], def: { body: "<p>Write something compelling…</p>" } },
  { comp: "block.cta-banner", key: "vb.cta", icon: "cta", fields: [{ k: "heading" }, { k: "text", ta: true }, { k: "buttonLabel" }, { k: "buttonUrl" }], def: { heading: "Ready to start?", text: "", buttonLabel: "Get started", buttonUrl: "#" } },
  { comp: "block.image", key: "vb.image", icon: "img", fields: [{ k: "caption" }], def: { caption: "" } },
  { comp: "block.feature-grid", key: "vb.features", icon: "grid", fields: [{ k: "heading" }], def: { heading: "Features", items: [{ title: "Feature", text: "" }, { title: "Feature", text: "" }, { title: "Feature", text: "" }] } },
];
const metaOf = (c: string) => TYPES.find((t) => t.comp === c);
const DEVW: Record<Device, string> = { desktop: "100%", tablet: "800px", mobile: "390px" };

function serialize(b: Block) {
  const out: Record<string, any> = { __component: b.__component };
  if (typeof b.id === "number") out.id = b.id;
  for (const [k, v] of Object.entries(b)) {
    if (k === "__component" || k === "id") continue;
    if (Array.isArray(v)) out[k] = v.map((it) => (it && typeof it === "object" ? Object.fromEntries(Object.entries(it).filter(([kk]) => kk !== "id" || typeof (it as any).id === "number").map(([kk, vv]) => [kk, vv])) : it));
    else if (v && typeof v === "object") { if (v.id != null && (v.url != null || v.mime != null || v.ext != null)) out[k] = v.id; }
    else out[k] = v;
  }
  return out;
}

export default function VisualBuilder() {
  const { t } = useLang();
  const { currentKey, current } = useTenant();
  const [pages, setPages] = useState<Page[]>([]);
  const [sel, setSel] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [active, setActive] = useState<number>(-1);
  const [device, setDevice] = useState<Device>("desktop");
  const [dragI, setDragI] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const tenantKey = currentKey && currentKey !== "workspace" ? currentKey : "";

  const loadPages = useCallback(async () => {
    let qs = "?page=1&pageSize=50&sort=updatedAt:DESC";
    if (tenantKey) qs += "&filters[tenant][key][$eq]=" + encodeURIComponent(tenantKey);
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + LANDING_UID + qs);
      if (!r.ok) return setPages([]);
      const j = await r.json();
      const list = (j.results ?? j.data ?? []).map((e: any) => ({ docId: String(e.documentId ?? e.id), locale: e.locale, title: e.title || "#" + (e.documentId ?? e.id) }));
      setPages(list);
      if (list[0]) open(list[0]);
    } catch { setPages([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);
  useEffect(() => { loadPages(); }, [loadPages]);

  async function open(p: Page) {
    setSel(p); setLoading(true); setBlocks([]); setActive(-1); setMsg(null);
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + LANDING_UID + "/" + p.docId + (p.locale ? "?locale=" + p.locale : ""));
      const j = await r.json();
      const bl = ((j.data ?? j).blocks ?? []) as Block[];
      setBlocks(bl); setActive(bl.length ? 0 : -1);
    } catch {} finally { setLoading(false); }
  }

  const setField = (i: number, k: string, v: any) => setBlocks((b) => b.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: number) => setBlocks((b) => { const n = [...b]; const j = i + d; if (j < 0 || j >= n.length) return b; [n[i], n[j]] = [n[j], n[i]]; setActive(j); return n; });
  const reorder = (from: number, to: number) => setBlocks((b) => { if (from === to || from < 0) return b; const n = [...b]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });
  const remove = (i: number) => { setBlocks((b) => b.filter((_, j) => j !== i)); setActive(-1); };
  const dup = (i: number) => setBlocks((b) => { const c = JSON.parse(JSON.stringify(b[i])); delete c.id; const n = [...b]; n.splice(i + 1, 0, c); setActive(i + 1); return n; });
  const add = (comp: string) => { const m = metaOf(comp); setBlocks((b) => { setActive(b.length); return [...b, JSON.parse(JSON.stringify({ __component: comp, ...(m?.def || {}) }))]; }); };
  // feature items
  const setItem = (i: number, k: number, field: string, v: string) => setBlocks((b) => b.map((x, j) => j === i ? { ...x, items: (x.items || []).map((it: any, kk: number) => kk === k ? { ...it, [field]: v } : it) } : x));
  const addItem = (i: number) => setBlocks((b) => b.map((x, j) => j === i ? { ...x, items: [...(x.items || []), { title: "Feature", text: "" }] } : x));
  const rmItem = (i: number, k: number) => setBlocks((b) => b.map((x, j) => j === i ? { ...x, items: (x.items || []).filter((_: any, kk: number) => kk !== k) } : x));

  async function save() {
    if (!sel) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + LANDING_UID + "/" + sel.docId + (sel.locale ? "?locale=" + sel.locale : ""), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: blocks.map(serialize), ...(sel.locale ? { locale: sel.locale } : {}) }),
      });
      setMsg(r.ok ? { t: t("vb.saved"), ok: true } : { t: "Save failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  // ---- canvas preview (inline-editable) ----
  function preview(b: Block, i: number) {
    const c = b.__component;
    if (c === "block.hero") return (
      <div className="vbk-hero">
        <InlineText as="span" className="vbk-kicker" value={b.kicker || ""} onChange={(v) => setField(i, "kicker", v)} placeholder="KICKER" />
        <InlineText as="h2" value={b.heading || ""} onChange={(v) => setField(i, "heading", v)} placeholder="Heading" />
        <InlineText as="p" value={b.subheading || ""} onChange={(v) => setField(i, "subheading", v)} placeholder="Subheading…" />
        {b.ctaLabel != null && <InlineText as="span" className="vbk-btn" value={b.ctaLabel || ""} onChange={(v) => setField(i, "ctaLabel", v)} placeholder="Button" />}
      </div>
    );
    if (c === "block.cta-banner") return (
      <div className="vbk-cta">
        <div style={{ flex: 1 }}>
          <InlineText as="b" value={b.heading || ""} onChange={(v) => setField(i, "heading", v)} placeholder="Heading" />
          <InlineText as="p" value={b.text || ""} onChange={(v) => setField(i, "text", v)} placeholder="Text…" />
        </div>
        <InlineText as="span" className="vbk-btn" value={b.buttonLabel || ""} onChange={(v) => setField(i, "buttonLabel", v)} placeholder="Button" />
      </div>
    );
    if (c === "block.richtext") return <div className="vbk-rich" dangerouslySetInnerHTML={{ __html: b.body || "<p style='color:#999'>Rich text… (edit in panel)</p>" }} />;
    if (c === "block.image") return (
      <figure className="vbk-image">
        {b.image?.url ? <img src={(b.image.url as string).startsWith("http") ? b.image.url : "/api/strapi" + b.image.url} alt="" /> : <div className="vbk-imgph"><Icon name="img" /></div>}
        <InlineText as="figcaption" value={b.caption || ""} onChange={(v) => setField(i, "caption", v)} placeholder="Caption…" />
      </figure>
    );
    if (c === "block.feature-grid") {
      const items = Array.isArray(b.items) ? b.items : [];
      const cols = Math.min(Number(b.columns) || 3, Math.max(items.length, 1), 4);
      return (
        <div className="vbk-features">
          <InlineText as="h3" value={b.heading || ""} onChange={(v) => setField(i, "heading", v)} placeholder="Section title" />
          <div className="vbk-grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>
            {items.map((it: any, k: number) => (
              <div className="vbk-feat" key={k}>
                <div className="ic">◆</div>
                <InlineText as="b" value={it.title || ""} onChange={(v) => setItem(i, k, "title", v)} placeholder="Title" />
                <InlineText as="span" value={it.text || ""} onChange={(v) => setItem(i, k, "text", v)} placeholder="Description" />
              </div>
            ))}
          </div>
        </div>
      );
    }
    return <div className="vbk-rich"><span className="muted">{c}</span></div>;
  }

  const aMeta = active >= 0 ? metaOf(blocks[active]?.__component) : null;

  return (
    <>
      <div className="vh">
        <div><h1>{t("nav.builder")}</h1><p>{t("vb.sub")}</p></div>
        <div className="vh-act">
          {pages.length > 1 && (
            <select className="vb-sel" value={sel?.docId || ""} onChange={(e) => { const p = pages.find((x) => x.docId === e.target.value); if (p) open(p); }}>
              {pages.map((p) => <option key={p.docId} value={p.docId}>{p.title}</option>)}
            </select>
          )}
          <div className="seg">
            {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
              <button key={d} className={device === d ? "on" : ""} onClick={() => setDevice(d)} title={d}><Icon name={d} /></button>
            ))}
          </div>
          {sel && <button className="btn btn--p" onClick={save} disabled={saving}><Icon name="spark" />{saving ? t("vb.saving") : t("vb.save")}</button>}
        </div>
      </div>

      {msg && <div className="panel" style={{ marginBottom: 14 }}><span className={"badge " + (msg.ok ? "b-ok" : "b-warn")}><span className="dot" />{msg.ok ? "OK" : "!"}</span><span style={{ marginLeft: 10, color: msg.ok ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{msg.t}</span></div>}

      <div className="vb2">
        <aside className="vb-insp">
          <div className="vb-insp-h">{t("vb.blocks")} {blocks.length > 0 && <span className="mono" style={{ color: "var(--mut)" }}>{blocks.length}</span>}</div>
          {blocks.map((b, i) => {
            const bm = metaOf(b.__component);
            const isA = i === active;
            return (
              <div className={"vb-block" + (isA ? " sel" : "") + (dragI === i ? " drag" : "")} key={i}
                draggable onDragStart={() => setDragI(i)} onDragEnd={() => setDragI(-1)}
                onDragOver={(e) => e.preventDefault()} onDrop={() => { reorder(dragI, i); setDragI(-1); }}>
                <div className="vb-block-h" onClick={() => setActive(isA ? -1 : i)}>
                  <span className="vb-grip"><Icon name="drag" /></span>
                  <Icon name={bm?.icon || "doc"} />
                  <b>{bm ? t(bm.key) : b.__component}</b>
                  <div className="vb-block-a" onClick={(e) => e.stopPropagation()}>
                    <button title="↑" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button title="↓" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>↓</button>
                    <button title="�copy" onClick={() => dup(i)}>⧉</button>
                    <button title="✕" className="rm" onClick={() => remove(i)}><Icon name="trash" /></button>
                  </div>
                </div>
                {isA && (
                  <div className="vb-block-b">
                    {(bm?.fields || []).map((f: any) => (
                      <div className="fld" key={f.k} style={{ marginBottom: 9 }}>
                        <label style={{ fontSize: 11 }}>{f.k}</label>
                        {f.rich
                          ? <RichText value={b[f.k] || ""} onChange={(h) => setField(i, f.k, h)} />
                          : f.ta
                            ? <textarea value={b[f.k] || ""} onChange={(e) => setField(i, f.k, e.target.value)} style={{ minHeight: 54 }} />
                            : <input value={b[f.k] || ""} onChange={(e) => setField(i, f.k, e.target.value)} />}
                      </div>
                    ))}
                    {b.__component === "block.feature-grid" && (
                      <div className="vb-items">
                        <label style={{ fontSize: 11 }}>items</label>
                        {(b.items || []).map((it: any, k: number) => (
                          <div className="vb-item" key={k}>
                            <input value={it.title || ""} placeholder="title" onChange={(e) => setItem(i, k, "title", e.target.value)} />
                            <input value={it.text || ""} placeholder="text" onChange={(e) => setItem(i, k, "text", e.target.value)} />
                            <button className="rm" onClick={() => rmItem(i, k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addItem(i)}><Icon name="plus" />item</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="vb-add">
            <div className="muted" style={{ fontSize: 11, marginBottom: 7 }}>{t("vb.addblock")}</div>
            <div className="vb-add-grid">
              {TYPES.map((ty) => <button key={ty.comp} className="vb-add-btn" onClick={() => add(ty.comp)}><Icon name={ty.icon} />{t(ty.key)}</button>)}
            </div>
          </div>
        </aside>

        <div className="vb-stage">
          {!sel || loading ? <div className="muted" style={{ padding: 40, textAlign: "center" }}>{loading ? t("vb.loading") : t("vb.empty")}</div> : (
            <div className="vb-frame">
              <div className="vb-frame-bar"><i /><i /><i /><span className="psite-url">{(tenantKey || "site") + ".go.th/" + (sel.title || "").slice(0, 14)}</span><span className="vb-dev-tag">{device}</span></div>
              <div className="vb-canvas" style={{ maxWidth: DEVW[device] }}>
                <div className="vbk-nav"><b>{current?.name || "WebX"}</b><span>Home</span><span>Services</span><span>News</span></div>
                {blocks.length === 0 && <div className="muted" style={{ padding: 50, textAlign: "center" }}>{t("vb.noblocks")}</div>}
                {blocks.map((b, i) => (
                  <div className={"vbk-wrap" + (i === active ? " sel" : "")} key={i} onClick={() => setActive(i)}>
                    {i === active && (
                      <div className="vbk-tools" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                        <button onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>↓</button>
                        <button onClick={() => dup(i)}>⧉</button>
                        <button className="rm" onClick={() => remove(i)}><Icon name="trash" /></button>
                      </div>
                    )}
                    {preview(b, i)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
