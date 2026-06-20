"use client";
import { useEffect, useState, useCallback } from "react";
import Icon from "./Icon";
import RichText from "./RichText";
import InlineText from "./InlineText";
import BlockTypeEditor, { BlockType } from "./BlockTypeEditor";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";

type Block = Record<string, any> & { __component: string };
type Page = { docId: string; locale?: string; title: string };
type Device = "desktop" | "tablet" | "mobile";

const LANDING_UID = "api::landing.landing";
const PV_UID = "api::page-version.page-version";
const AB_UID = "api::ab-event.ab-event";
function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}
function fmtTime(iso: string, lang: string) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
}
type DiffRow = { i: number; comp: string; status: "added" | "removed" | "changed" | "replaced" | "same"; fields?: string[] };
// block-level diff of a snapshot (prev) vs the current canvas (curr) — no Strapi EE needed
function diffBlocks(prev: any[], curr: any[]): { added: number; removed: number; changed: number; rows: DiffRow[] } {
  prev = prev || []; curr = curr || [];
  const rows: DiffRow[] = []; let added = 0, removed = 0, changed = 0;
  const n = Math.max(prev.length, curr.length);
  for (let i = 0; i < n; i++) {
    const a = prev[i], b = curr[i];
    if (a && !b) { rows.push({ i, comp: a.__component, status: "removed" }); removed++; continue; }
    if (!a && b) { rows.push({ i, comp: b.__component, status: "added" }); added++; continue; }
    if (a.__component !== b.__component) { rows.push({ i, comp: b.__component, status: "replaced" }); changed++; continue; }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => k !== "__component" && k !== "id"));
    const fields: string[] = [];
    keys.forEach((k) => { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) fields.push(k); });
    if (fields.length) { rows.push({ i, comp: b.__component, status: "changed", fields }); changed++; }
    else rows.push({ i, comp: b.__component, status: "same" });
  }
  return { added, removed, changed, rows };
}
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
    else if (v && typeof v === "object") { if (v.id != null && (v.url != null || v.mime != null || v.ext != null)) out[k] = v.id; else out[k] = v; }
    else out[k] = v;
  }
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]));
function interpolate(bt: BlockType, props: Record<string, any>) {
  const rich = new Set((bt.fieldsSchema || []).filter((f: any) => f.type === "richtext").map((f: any) => f.key));
  const imgs = new Set((bt.fieldsSchema || []).filter((f: any) => f.type === "image").map((f: any) => f.key));
  return (bt.template || "").replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, k) => {
    const v = props?.[k];
    if (v == null) return "";
    if (imgs.has(k)) { const u = (v as any).url || v; return typeof u === "string" ? (u.startsWith("http") ? u : "/api/strapi" + u) : ""; }
    return rich.has(k) ? String(v) : esc(String(v));
  });
}

export default function VisualBuilder() {
  const { t, lang } = useLang();
  const { currentKey, current } = useTenant();
  const [pages, setPages] = useState<Page[]>([]);
  const [sel, setSel] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [active, setActive] = useState<number>(-1);
  const [device, setDevice] = useState<Device>("desktop");
  const [dragI, setDragI] = useState<number>(-1);
  const [insAt, setInsAt] = useState<number>(-1);
  const [dragNew, setDragNew] = useState<{ comp?: string; custom?: BlockType } | null>(null);
  const [dropAt, setDropAt] = useState<number>(-1);
  const [dragBlock, setDragBlock] = useState<number>(-1);
  const [previewMode, setPreviewMode] = useState(false);
  const [uploadingI, setUploadingI] = useState<number>(-1);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [customTypes, setCustomTypes] = useState<BlockType[]>([]);
  const [showTypeEditor, setShowTypeEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [sched, setSched] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [cmpId, setCmpId] = useState<any>(null);
  const [editing, setEditing] = useState<"A" | "B">("A");
  const [otherBlocks, setOtherBlocks] = useState<Block[]>([]);
  const [abEnabled, setAbEnabled] = useState(false);
  const [abSplit, setAbSplit] = useState(50);
  const [abOpen, setAbOpen] = useState(false);
  const [abStats, setAbStats] = useState<{ A: { view: number; conversion: number }; B: { view: number; conversion: number } }>({ A: { view: 0, conversion: 0 }, B: { view: 0, conversion: 0 } });
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

  const loadTypes = useCallback(async () => {
    try {
      let qs = "?pageSize=100";
      if (tenantKey) qs += "&filters[$or][0][tenant][key][$eq]=" + encodeURIComponent(tenantKey) + "&filters[$or][1][tenant][id][$null]=true";
      const r = await fetch("/api/strapi/content-manager/collection-types/api::block-type.block-type" + qs);
      if (!r.ok) return;
      const j = await r.json();
      setCustomTypes((j.results ?? j.data ?? []).map((e: any) => ({ docId: String(e.documentId ?? e.id), key: e.key, name: e.name, icon: e.icon, fieldsSchema: e.fieldsSchema || [], template: e.template || "" })));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);
  useEffect(() => { loadTypes(); }, [loadTypes]);

  async function open(p: Page) {
    setSel(p); setLoading(true); setBlocks([]); setActive(-1); setMsg(null);
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + LANDING_UID + "/" + p.docId + (p.locale ? "?locale=" + p.locale : ""));
      const j = await r.json();
      const data = j.data ?? j;
      const bl = (data.blocks ?? []) as Block[];
      setBlocks(bl); setActive(bl.length ? 0 : -1);
      setOtherBlocks((data.variantBlocks ?? []) as Block[]);
      setEditing("A");
      setAbEnabled(!!data.abEnabled);
      setAbSplit(typeof data.abSplit === "number" ? data.abSplit : 50);
    } catch {} finally { setLoading(false); }
  }

  const setField = (i: number, k: string, v: any) => setBlocks((b) => b.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: number) => setBlocks((b) => { const n = [...b]; const j = i + d; if (j < 0 || j >= n.length) return b; [n[i], n[j]] = [n[j], n[i]]; setActive(j); return n; });
  const reorder = (from: number, to: number) => setBlocks((b) => { if (from === to || from < 0) return b; const n = [...b]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });
  const remove = (i: number) => { setBlocks((b) => b.filter((_, j) => j !== i)); setActive(-1); };
  const dup = (i: number) => setBlocks((b) => { const c = JSON.parse(JSON.stringify(b[i])); delete c.id; const n = [...b]; n.splice(i + 1, 0, c); setActive(i + 1); return n; });
  const add = (comp: string) => { const m = metaOf(comp); setBlocks((b) => { setActive(b.length); return [...b, JSON.parse(JSON.stringify({ __component: comp, ...(m?.def || {}) }))]; }); };
  const addAt = (idx: number, comp: string) => { const m = metaOf(comp); setBlocks((b) => { const n = [...b]; n.splice(idx, 0, JSON.parse(JSON.stringify({ __component: comp, ...(m?.def || {}) }))); setActive(idx); return n; }); setInsAt(-1); };
  const addCustomAt = (idx: number, ct: BlockType) => { const props: Record<string, any> = {}; (ct.fieldsSchema || []).forEach((f) => (props[f.key] = f.type === "image" ? null : "")); setBlocks((b) => { const n = [...b]; n.splice(idx, 0, { __component: "block.custom", typeKey: ct.key, props }); setActive(idx); return n; }); };
  function handleDrop(idx: number) {
    if (dragBlock >= 0) { const to = idx > dragBlock ? idx - 1 : idx; reorder(dragBlock, to); setActive(to); }
    else if (dragNew?.comp) addAt(idx, dragNew.comp);
    else if (dragNew?.custom) addCustomAt(idx, dragNew.custom);
    setDragNew(null); setDragBlock(-1); setDropAt(-1);
  }
  async function uploadImg(i: number, file: File) {
    setUploadingI(i);
    const fd = new FormData(); fd.append("files", file);
    try {
      const r = await fetch("/api/strapi/upload", { method: "POST", body: fd });
      if (r.ok) { const j = await r.json(); const f = Array.isArray(j) ? j[0] : j; if (f?.id) setField(i, "image", { id: f.id, url: f.url }); }
    } finally { setUploadingI(-1); }
  }
  // custom blocks
  const addCustom = (ct: BlockType) => { const props: Record<string, any> = {}; (ct.fieldsSchema || []).forEach((f) => (props[f.key] = f.type === "image" ? null : "")); setBlocks((b) => { setActive(b.length); return [...b, { __component: "block.custom", typeKey: ct.key, props }]; }); };
  const setProp = (i: number, key: string, val: any) => setBlocks((b) => b.map((x, j) => (j === i ? { ...x, props: { ...(x.props || {}), [key]: val } } : x)));
  async function uploadProp(i: number, key: string, file: File) {
    setUploadingI(i);
    const fd = new FormData(); fd.append("files", file);
    try { const r = await fetch("/api/strapi/upload", { method: "POST", body: fd }); if (r.ok) { const j = await r.json(); const f = Array.isArray(j) ? j[0] : j; if (f?.id) setProp(i, key, { id: f.id, url: f.url }); } } finally { setUploadingI(-1); }
  }
  const iconOf = (b: Block) => b.__component === "block.custom" ? (customTypes.find((c) => c.key === b.typeKey)?.icon || "grid") : (metaOf(b.__component)?.icon || "doc");
  const labelOf = (b: Block) => b.__component === "block.custom" ? (customTypes.find((c) => c.key === b.typeKey)?.name || "Custom") : (metaOf(b.__component) ? t(metaOf(b.__component)!.key) : b.__component);
  // AI: ground a new section in real tenant content via /api/ai/answer
  async function aiGenerate() {
    const p = aiPrompt.trim(); if (!p) return;
    setAiBusy(true);
    try {
      const tn = tenantKey || "dga";
      const j = await fetch("/api/strapi/api/ai/answer?q=" + encodeURIComponent(p) + "&tenant=" + encodeURIComponent(tn) + "&locale=" + lang).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const ans = j?.data?.answer || "";
      const block = { __component: "block.hero", kicker: "AI", heading: p, subheading: ans || (lang === "th" ? "เพิ่มรายละเอียดที่นี่" : "Add details here"), ctaLabel: lang === "th" ? "เริ่มใช้งาน" : "Get started", ctaUrl: "#" };
      setBlocks((b) => { setActive(b.length); return [...b, block]; });
      setAiPrompt("");
    } finally { setAiBusy(false); }
  }
  // feature items
  const setItem = (i: number, k: number, field: string, v: string) => setBlocks((b) => b.map((x, j) => j === i ? { ...x, items: (x.items || []).map((it: any, kk: number) => kk === k ? { ...it, [field]: v } : it) } : x));
  const addItem = (i: number) => setBlocks((b) => b.map((x, j) => j === i ? { ...x, items: [...(x.items || []), { title: "Feature", text: "" }] } : x));
  const rmItem = (i: number, k: number) => setBlocks((b) => b.map((x, j) => j === i ? { ...x, items: (x.items || []).filter((_: any, kk: number) => kk !== k) } : x));

  // build the landing body, writing BOTH variants (A = dynamic zone, B = json) + A/B config
  function pageBody() {
    const aBlocks = editing === "A" ? blocks : otherBlocks;
    const bBlocks = editing === "B" ? blocks : otherBlocks;
    return { blocks: aBlocks.map(serialize), variantBlocks: bBlocks, abEnabled, abSplit, ...(sel?.locale ? { locale: sel.locale } : {}) };
  }
  async function save() {
    if (!sel) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + LANDING_UID + "/" + sel.docId + (sel.locale ? "?locale=" + sel.locale : ""), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pageBody()),
      });
      setMsg(r.ok ? { t: t("vb.saved"), ok: true } : { t: "Save failed (HTTP " + r.status + ")", ok: false });
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  async function publish() {
    if (!sel) return;
    setSaving(true); setMsg(null);
    const base = "/api/strapi/content-manager/collection-types/" + LANDING_UID + "/" + sel.docId + (sel.locale ? "?locale=" + sel.locale : "");
    try {
      const sv = await fetch(base, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pageBody()) });
      if (!sv.ok) { setMsg({ t: "Save failed (HTTP " + sv.status + ")", ok: false }); setSaving(false); return; }
      const pr = await fetch("/api/strapi/content-manager/collection-types/" + LANDING_UID + "/" + sel.docId + "/actions/publish" + (sel.locale ? "?locale=" + sel.locale : ""), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setMsg(pr.ok ? { t: t("vb.published"), ok: true } : { t: "Publish failed (HTTP " + pr.status + ")", ok: false });
      if (pr.ok) await saveVersion("Published");
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  // ---- version history (snapshots) ----
  async function saveVersion(label: string) {
    if (!sel) return;
    try {
      await fetch("/api/strapi/content-manager/collection-types/" + PV_UID, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentRef: sel.docId, contentType: LANDING_UID, label, data: { title: sel.title, blocks } }),
      });
    } catch {}
  }
  async function loadHistory() {
    if (!sel) return;
    setHistoryOpen(true); setVersions([]);
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + PV_UID + "?sort=createdAt:DESC&pageSize=50&filters[documentRef][$eq]=" + encodeURIComponent(sel.docId));
      if (!r.ok) return;
      const j = await r.json();
      setVersions((j.results ?? j.data ?? []).map((e: any) => ({ id: e.documentId ?? e.id, label: e.label, createdAt: e.createdAt, data: e.data })));
    } catch {}
  }
  function restore(v: any) {
    const b = v?.data?.blocks;
    if (Array.isArray(b)) { setBlocks(b as Block[]); setActive(b.length ? 0 : -1); setHistoryOpen(false); setMsg({ t: t("vb.restored"), ok: true }); }
  }

  // ---- scheduled publishing (publishStart / publishEnd) ----
  async function openSchedule() {
    if (!sel) return;
    setSchedOpen(true); setSched({ start: "", end: "" });
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + LANDING_UID + "/" + sel.docId + (sel.locale ? "?locale=" + sel.locale : ""));
      if (!r.ok) return;
      const j = await r.json(); const d = j?.data ?? j;
      setSched({ start: toLocalInput(d.publishStart), end: toLocalInput(d.publishEnd) });
    } catch {}
  }
  async function saveSchedule() {
    if (!sel) return;
    setSaving(true); setMsg(null);
    try {
      const body: any = { publishStart: sched.start ? new Date(sched.start).toISOString() : null, publishEnd: sched.end ? new Date(sched.end).toISOString() : null };
      if (sel.locale) body.locale = sel.locale;
      const r = await fetch("/api/strapi/content-manager/collection-types/" + LANDING_UID + "/" + sel.docId + (sel.locale ? "?locale=" + sel.locale : ""), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setMsg(r.ok ? { t: t("vb.schedsaved"), ok: true } : { t: "Save failed (HTTP " + r.status + ")", ok: false });
      if (r.ok) setSchedOpen(false);
    } catch { setMsg({ t: "Cannot reach the backend.", ok: false }); }
    finally { setSaving(false); }
  }

  // ---- A/B testing ----
  function setEditingVariant(v: "A" | "B") {
    if (v === editing) return;
    setOtherBlocks(blocks);            // stash the array we're leaving
    setBlocks(otherBlocks);            // load the other variant onto the canvas
    setActive(otherBlocks.length ? 0 : -1);
    setEditing(v);
  }
  async function loadAbStats() {
    if (!sel) return;
    try {
      const r = await fetch("/api/strapi/content-manager/collection-types/" + AB_UID + "?pageSize=2000&filters[documentRef][$eq]=" + encodeURIComponent(sel.docId));
      if (!r.ok) return;
      const j = await r.json();
      const ev = (j.results ?? j.data ?? []) as any[];
      const agg = { A: { view: 0, conversion: 0 }, B: { view: 0, conversion: 0 } };
      ev.forEach((e) => { const v = e.variant === "B" ? "B" : "A"; const k = e.kind === "conversion" ? "conversion" : "view"; (agg as any)[v][k]++; });
      setAbStats(agg);
    } catch {}
  }
  function openAb() { if (!sel) return; setAbOpen(true); loadAbStats(); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { if (previewMode) setPreviewMode(false); if (historyOpen) setHistoryOpen(false); if (schedOpen) setSchedOpen(false); if (abOpen) setAbOpen(false); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewMode, historyOpen, schedOpen, abOpen]);

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
    if (c === "block.custom") {
      const bt = customTypes.find((x) => x.key === b.typeKey);
      if (!bt) return <div className="vbk-rich"><span className="muted">Unknown block: {b.typeKey}</span></div>;
      return <div className="vbk-custom" dangerouslySetInnerHTML={{ __html: interpolate(bt, b.props || {}) }} />;
    }
    return <div className="vbk-rich"><span className="muted">{c}</span></div>;
  }

  function ins(index: number) {
    return (
      <div className={"vbk-ins" + (dropAt === index ? " over" : "")} onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { if (dragNew || dragBlock >= 0) { e.preventDefault(); setDropAt(index); } }}
        onDragLeave={() => setDropAt((d) => (d === index ? -1 : d))}
        onDrop={(e) => { e.preventDefault(); handleDrop(index); }}>
        <button className="vbk-ins-btn" aria-label={t("a11y.insert")} title={t("a11y.insert")} onClick={() => setInsAt(insAt === index ? -1 : index)}><Icon name="plus" /></button>
        {insAt === index && (
          <div className="vbk-ins-pop">
            {TYPES.map((ty) => <button key={ty.comp} onClick={() => addAt(index, ty.comp)}><Icon name={ty.icon} />{t(ty.key)}</button>)}
          </div>
        )}
      </div>
    );
  }

  const compName = (comp: string) => { const m = metaOf(comp); return m ? t(m.key) : comp.replace("block.", ""); };
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
          {sel && !previewMode && <>
            <button className={"btn btn--g" + (abEnabled ? " ab-on" : "")} onClick={openAb} title={t("vb.ab")}><Icon name="split" />{t("vb.ab")}{abEnabled ? " ·" + (editing) : ""}</button>
            <button className="btn btn--g" onClick={openSchedule} title={t("vb.schedule")}><Icon name="calendar" />{t("vb.schedule")}</button>
            <button className="btn btn--g" onClick={loadHistory} title={t("vb.history")}><Icon name="clock" />{t("vb.history")}</button>
          </>}
          {sel && <>
            <button className="btn btn--g" onClick={() => setPreviewMode((p) => !p)}><Icon name="eye" />{previewMode ? t("vb.exitpreview") : t("vb.preview")}</button>
            <button className="btn btn--g" onClick={save} disabled={saving}>{t("vb.save")}</button>
            <button className="btn btn--p" onClick={publish} disabled={saving}><Icon name="spark" />{saving ? t("vb.publishing") : t("vb.publish")}</button>
          </>}
        </div>
      </div>

      {msg && <div className="panel" style={{ marginBottom: 14 }}><span className={"badge " + (msg.ok ? "b-ok" : "b-warn")}><span className="dot" />{msg.ok ? "OK" : "!"}</span><span style={{ marginLeft: 10, color: msg.ok ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{msg.t}</span></div>}

      {previewMode && <div className="vb-pvbar"><Icon name="eye" />{t("vb.previewhint")}</div>}
      {editing === "B" && !previewMode && <div className="vb-pvbar vb-bbar"><Icon name="split" />{t("vb.editingb")}</div>}
      <div className={"vb2" + (previewMode ? " preview" : "")}>
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
                  <Icon name={iconOf(b)} />
                  <b>{labelOf(b)}</b>
                  <div className="vb-block-a" onClick={(e) => e.stopPropagation()}>
                    <button aria-label={t("a11y.moveup")} title={t("a11y.moveup")} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button aria-label={t("a11y.movedown")} title={t("a11y.movedown")} onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>↓</button>
                    <button aria-label={t("a11y.duplicate")} title={t("a11y.duplicate")} onClick={() => dup(i)}>⧉</button>
                    <button aria-label={t("a11y.delete")} title={t("a11y.delete")} className="rm" onClick={() => remove(i)}><Icon name="trash" /></button>
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
                    {(b.__component === "block.image" || b.__component === "block.hero") && (
                      <div className="fld" style={{ marginBottom: 9 }}>
                        <label style={{ fontSize: 11 }}>image</label>
                        <div className="ed-media">
                          {b.image?.url
                            ? <img className="ed-img" src={(b.image.url as string).startsWith("http") ? b.image.url : "/api/strapi" + b.image.url} alt="" />
                            : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                          <label className="btn btn--g" style={{ cursor: "pointer" }}>
                            <Icon name="img" />{uploadingI === i ? t("m.uploading") : t("m.change")}
                            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadImg(i, e.target.files[0])} />
                          </label>
                        </div>
                      </div>
                    )}
                    {b.__component === "block.feature-grid" && (
                      <div className="vb-items">
                        <label style={{ fontSize: 11 }}>items</label>
                        {(b.items || []).map((it: any, k: number) => (
                          <div className="vb-item" key={k}>
                            <input value={it.title || ""} placeholder="title" onChange={(e) => setItem(i, k, "title", e.target.value)} />
                            <input value={it.text || ""} placeholder="text" onChange={(e) => setItem(i, k, "text", e.target.value)} />
                            <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmItem(i, k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addItem(i)}><Icon name="plus" />item</button>
                      </div>
                    )}
                    {b.__component === "block.custom" && (() => {
                      const bt = customTypes.find((x) => x.key === b.typeKey);
                      if (!bt) return <div className="muted" style={{ fontSize: 12 }}>Unknown block type: {b.typeKey}</div>;
                      return (bt.fieldsSchema || []).map((f) => (
                        <div className="fld" key={f.key} style={{ marginBottom: 9 }}>
                          <label style={{ fontSize: 11 }}>{f.label || f.key}</label>
                          {f.type === "richtext"
                            ? <RichText value={b.props?.[f.key] || ""} onChange={(h) => setProp(i, f.key, h)} />
                            : f.type === "image"
                              ? <div className="ed-media">
                                  {b.props?.[f.key]?.url ? <img className="ed-img" src={(b.props[f.key].url as string).startsWith("http") ? b.props[f.key].url : "/api/strapi" + b.props[f.key].url} alt="" /> : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                                  <label className="btn btn--g" style={{ cursor: "pointer" }}><Icon name="img" />{uploadingI === i ? t("m.uploading") : t("m.change")}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadProp(i, f.key, e.target.files[0])} /></label>
                                </div>
                              : f.type === "textarea"
                                ? <textarea value={b.props?.[f.key] || ""} onChange={(e) => setProp(i, f.key, e.target.value)} style={{ minHeight: 54 }} />
                                : <input value={b.props?.[f.key] || ""} onChange={(e) => setProp(i, f.key, e.target.value)} />}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          <div className="vb-add">
            <div className="vb-ai">
              <Icon name="spark" />
              <input value={aiPrompt} placeholder={t("vb.aiph")} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aiGenerate()} />
              <button className="vb-ai-btn" onClick={aiGenerate} disabled={aiBusy || !aiPrompt.trim()}>{aiBusy ? t("vb.aigen") : t("vb.aibtn")}</button>
            </div>
            <div className="muted" style={{ fontSize: 11, margin: "12px 0 7px" }}>{t("vb.addblock")}</div>
            <div className="vb-add-grid">
              {TYPES.map((ty) => <button key={ty.comp} className="vb-add-btn" draggable onDragStart={() => setDragNew({ comp: ty.comp })} onDragEnd={() => { setDragNew(null); setDropAt(-1); }} onClick={() => add(ty.comp)}><Icon name={ty.icon} />{t(ty.key)}</button>)}
            </div>
            {customTypes.length > 0 && (
              <>
                <div className="muted" style={{ fontSize: 11, margin: "12px 0 7px" }}>{t("vb.custom")}</div>
                <div className="vb-add-grid">
                  {customTypes.map((ct) => <button key={ct.key} className="vb-add-btn" draggable onDragStart={() => setDragNew({ custom: ct })} onDragEnd={() => { setDragNew(null); setDropAt(-1); }} onClick={() => addCustom(ct)}><Icon name={ct.icon || "grid"} />{ct.name}</button>)}
                </div>
              </>
            )}
            <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={() => setShowTypeEditor(true)}><Icon name="code" />{t("vb.manage")}</button>
          </div>
        </aside>

        <div className="vb-stage">
          {!sel || loading ? <div className="muted" style={{ padding: 40, textAlign: "center" }}>{loading ? t("vb.loading") : t("vb.empty")}</div> : (
            <div className="vb-frame">
              <div className="vb-frame-bar"><i /><i /><i /><span className="psite-url">{(tenantKey || "site") + ".go.th/" + (sel.title || "").slice(0, 14)}</span><span className="vb-dev-tag">{device}</span></div>
              <div className={"vb-canvas" + (dragNew || dragBlock >= 0 ? " dragging" : "")} style={{ maxWidth: DEVW[device] }}>
                <div className="vbk-nav"><b>{current?.name || "WebX"}</b><span>Home</span><span>Services</span><span>News</span></div>
                {blocks.length === 0 && <div className="muted" style={{ padding: 50, textAlign: "center" }}>{t("vb.noblocks")}</div>}
                {blocks.map((b, i) => (
                  <div key={i}>
                    {ins(i)}
                    <div className={"vbk-wrap" + (i === active ? " sel" : "") + (i === dragBlock ? " ghost" : "")} onClick={() => setActive(i)}>
                      <div className="vbk-grip-c" draggable onDragStart={(e) => { e.stopPropagation(); setDragBlock(i); }} onDragEnd={() => { setDragBlock(-1); setDropAt(-1); }} title="drag to reorder"><Icon name="drag" /></div>
                      {i === active && (
                        <div className="vbk-tools" onClick={(e) => e.stopPropagation()}>
                          <button aria-label={t("a11y.moveup")} title={t("a11y.moveup")} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                          <button aria-label={t("a11y.movedown")} title={t("a11y.movedown")} onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>↓</button>
                          <button aria-label={t("a11y.duplicate")} title={t("a11y.duplicate")} onClick={() => dup(i)}>⧉</button>
                          <button className="rm" aria-label={t("a11y.delete")} title={t("a11y.delete")} onClick={() => remove(i)}><Icon name="trash" /></button>
                        </div>
                      )}
                      {preview(b, i)}
                    </div>
                  </div>
                ))}
                {blocks.length > 0 && ins(blocks.length)}
              </div>
            </div>
          )}
        </div>
      </div>

      {showTypeEditor && <BlockTypeEditor tenantKey={tenantKey} onClose={() => setShowTypeEditor(false)} onSaved={loadTypes} />}

      {historyOpen && (
        <>
          <div className="scrim" onClick={() => setHistoryOpen(false)} />
          <div className="vb-drawer" role="dialog" aria-modal="true" aria-label={t("vb.history")}>
            <div className="ovhead">
              <h3 style={{ flex: 1 }}>{t("vb.history")}</h3>
              <button className="btn btn--g" onClick={() => saveVersion(t("vb.manualver")).then(loadHistory)}><Icon name="plus" />{t("vb.savever")}</button>
              <button className="ic-btn" onClick={() => setHistoryOpen(false)} aria-label={t("a11y.close")}><Icon name="close" /></button>
            </div>
            <div className="vb-vers">
              {versions.length === 0 && <div className="muted" style={{ padding: 12, fontSize: 12.5 }}>{t("vb.nohistory")}</div>}
              {versions.map((v) => {
                const open = cmpId === v.id;
                const d = open ? diffBlocks(v.data?.blocks, blocks) : null;
                const changed = d ? d.rows.filter((r) => r.status !== "same") : [];
                return (
                  <div className="vb-vergrp" key={v.id}>
                    <div className="vb-ver">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{v.label || "—"}</b>
                        <div className="muted" style={{ fontSize: 11 }}>{fmtTime(v.createdAt, lang)} · {(v.data?.blocks?.length ?? 0)} {t("vb.blocks_n")}</div>
                      </div>
                      <button className="vb-cmp" onClick={() => setCmpId(open ? null : v.id)}>{open ? t("vb.hidediff") : t("vb.compare")}</button>
                      <button className="btn btn--g" onClick={() => restore(v)}><Icon name="undo" />{t("vb.restore")}</button>
                    </div>
                    {open && d && (
                      <div className="vb-diff">
                        {changed.length === 0 ? <div className="muted" style={{ fontSize: 12, padding: "2px 2px 4px" }}>{t("vb.nochanges")}</div> :
                          changed.map((r, ix) => (
                            <div className={"vb-diff-row " + r.status} key={ix}>
                              <span className="vb-diff-tag">{t("vb.diff" + r.status)}</span>
                              <span className="vb-diff-name">{compName(r.comp)} #{r.i + 1}</span>
                              {r.fields && r.fields.length > 0 && <span className="muted" style={{ fontSize: 11 }}>· {r.fields.join(", ")}</span>}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {schedOpen && (
        <>
          <div className="scrim" onClick={() => setSchedOpen(false)} />
          <div className="vb-sched" role="dialog" aria-modal="true" aria-label={t("vb.schedule")}>
            <div className="ovhead"><h3 style={{ flex: 1 }}>{t("vb.schedule")}</h3><button className="ic-btn" onClick={() => setSchedOpen(false)} aria-label={t("a11y.close")}><Icon name="close" /></button></div>
            <p className="muted" style={{ fontSize: 12.5, margin: "0 0 14px" }}>{t("vb.schedhint")}</p>
            <label className="vb-fld"><span>{t("vb.schedstart")}</span><input type="datetime-local" value={sched.start} onChange={(e) => setSched((s) => ({ ...s, start: e.target.value }))} /></label>
            <label className="vb-fld"><span>{t("vb.schedend")}</span><input type="datetime-local" value={sched.end} onChange={(e) => setSched((s) => ({ ...s, end: e.target.value }))} /></label>
            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
              <button className="btn btn--p" onClick={saveSchedule} disabled={saving}>{t("vb.savesched")}</button>
              <button className="btn btn--g" onClick={() => setSched({ start: "", end: "" })}>{t("vb.clear")}</button>
            </div>
          </div>
        </>
      )}

      {abOpen && (
        <>
          <div className="scrim" onClick={() => setAbOpen(false)} />
          <div className="vb-sched vb-ab" role="dialog" aria-modal="true" aria-label={t("vb.ab")}>
            <div className="ovhead"><h3 style={{ flex: 1 }}>{t("vb.ab")}</h3><button className="ic-btn" onClick={() => setAbOpen(false)} aria-label={t("a11y.close")}><Icon name="close" /></button></div>
            <label className="vb-abrow"><input type="checkbox" checked={abEnabled} onChange={(e) => setAbEnabled(e.target.checked)} /><span>{t("vb.abenable")}</span></label>
            {abEnabled && (
              <>
                <div className="vb-fld"><span>{t("vb.absplit")} — B {abSplit}% · A {100 - abSplit}%</span>
                  <input type="range" min={0} max={100} step={5} value={abSplit} onChange={(e) => setAbSplit(Number(e.target.value))} /></div>
                <div className="vb-fld"><span>{t("vb.abediting")}</span>
                  <div className="seg vb-abseg">
                    <button className={editing === "A" ? "on" : ""} onClick={() => setEditingVariant("A")}>A</button>
                    <button className={editing === "B" ? "on" : ""} onClick={() => setEditingVariant("B")}>B</button>
                    <button className="vb-copya" onClick={() => { setOtherBlocks(blocks.map((b) => JSON.parse(JSON.stringify(b)))); }} title={t("vb.abcopya")}><Icon name="copy" />{t("vb.abcopya")}</button>
                  </div></div>
                <div className="vb-abres">
                  {(["A", "B"] as const).map((vk) => {
                    const s = abStats[vk]; const rate = s.view ? Math.round((s.conversion / s.view) * 1000) / 10 : 0;
                    const other = abStats[vk === "A" ? "B" : "A"]; const orate = other.view ? other.conversion / other.view : 0;
                    const lead = s.view > 0 && (s.conversion / s.view) >= orate && rate > 0;
                    return (
                      <div className={"vb-abcard" + (editing === vk ? " on" : "")} key={vk}>
                        <b>Variant {vk}{lead ? <span className="vb-lead">{t("vb.abwinner")}</span> : null}</b>
                        <div className="vb-abnums"><div className="vb-abnum">{s.view}<span>{t("vb.abviews")}</span></div><div className="vb-abnum">{s.conversion}<span>{t("vb.abconv")}</span></div></div>
                        <div className="vb-abrate">{rate}% <span>{t("vb.abrate")}</span></div>
                      </div>
                    );
                  })}
                </div>
                <button className="vb-cmp" onClick={loadAbStats}>↻ {t("vb.abrefresh")}</button>
              </>
            )}
            <p className="muted" style={{ fontSize: 11.5, margin: "12px 0 0" }}>{t("vb.abhint")}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="btn btn--p" onClick={() => save()} disabled={saving}>{t("vb.save")}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
