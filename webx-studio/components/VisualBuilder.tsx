"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "./Icon";
import RichText from "./RichText";
import InlineText from "./InlineText";
import BlockTypeEditor, { BlockType } from "./BlockTypeEditor";
import Toolbox, { type PageTemplate } from "./Toolbox";
import IconManager, { CustomIcon } from "./IconManager";
import IconPicker from "./IconPicker";
import IconSpriteDefs from "./blockPreview/IconSpriteDefs";
import RealPreview from "./blockPreview/RealPreview";
import BlockComponents from "./BlockComponents";
import { FEATURE_ICONS, FEATURE_THEMES, STAT_ICONS } from "./blockPreview/iconChoices";
import type { Path } from "./blockPreview/editing";
import { useLang } from "./LangProvider";
import { useTenant } from "./TenantProvider";
import { cms, CmsError, type ContentTypeInfo } from "@/lib/cms";
import { sanitizeCmsHtml } from "@/lib/sanitize";
import { FORM_FIELD_DEFS } from "@/lib/formFieldDefs";
import { pickLandingPage } from "@/lib/homePage";
import { toBuilder, toWire, GENERIC_WP_TYPES, type Dialect } from "@/lib/blockDialect";
import { TYPES, ORST_TYPES, ROYALSOCIETY_TYPES, GENERIC_TYPES, BLOCK_CATEGORIES, ALL_TYPES, metaOf } from "@/lib/blockCatalog";
import { useAgentOptional, useAgent } from "./agent/AgentProvider";
import { useAgentContext } from "./agent/useAgentContext";
import type { AgentProposal } from "@/lib/agent/types";

type Block = Record<string, any> & { __component: string };
// `tenantKey` — only ever set for a WordPress page (wordpress.ts's
// normalizePost() derives it from the wtenant taxonomy term on every read)
// — is what lets open() resolve the RIGHT per-page dialect for a session
// with no single home tenant of its own (see open()'s own comment).
// `slug` — WordPress pages only (e.g. "orst-about"); lets a nav-link click
// inside the harness preview open the matching page (see navigateTo).
type Page = { docId: string; locale?: string; title: string; tenantKey?: string; slug?: string };
type Device = "desktop" | "tablet" | "mobile";

const LANDING_UID = "api::landing.landing";
const PAGE_UID = "api::page.page";
// A WordPress-hosted page (ORST/RoyalSociety) — see wordpress.ts's
// POST_TYPES/ACF_JSON_FIELDS and wordpress/mu-plugins/acf-fields.php's
// group_page_layout. Its blocks live in a different dialect (blockDialect.ts)
// than the two Strapi uids above, translated at open()/pageBody() only.
const WP_PAGE_UID = "wp:page";
const PV_UID = "api::page-version.page-version";
const AB_UID = "api::ab-event.ab-event";
// Saved whole-page block sets — the Toolbox's Templates tab (see Toolbox.tsx
// and strapi-cms/src/api/page-template). Strapi-only storage even for a
// WordPress-hosted page: a template is Builder authoring metadata, not site
// content, and WordPress has no equivalent place to keep one.
const TPL_UID = "api::page-template.page-template";
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
// The block-type catalog (TYPES/ORST_TYPES/ROYALSOCIETY_TYPES/GENERIC_TYPES/
// BLOCK_CATEGORIES/ALL_TYPES/metaOf) moved to lib/blockCatalog.ts (Phase 8)
// so the agent's own page-building tools (lib/agent/tools.ts) can share it —
// see that file's own header comment. Imported above; nothing else here
// changed.
const LIVE_DATA_COMPS = new Set(["block.highlights", "block.news-panel", "block.video-channel", "block.awards", "block.faq", "block.collection-list"]);
// Curated, not "every content type" — avoids surfacing system/structural
// types (page, tenant, audit-log, custom-role…) in the picker. Every uid
// here is already confirmed public-readable (ensurePublicPermissions in
// strapi-cms/src/seed/seed.ts already grants find/findOne to all of these)
// and tenant-scoped (governance.ts's SCOPED set).
const LISTABLE_UIDS = new Set([
  "api::article.article", "api::video.video", "api::award.award", "api::faq.faq",
  "api::service.service", "api::job.job", "api::download.download", "api::ebook.ebook",
  "api::gallery.gallery", "api::event.event", "api::blog.blog", "api::catalog.catalog",
  "api::weblink.weblink", "api::location.location", "api::popup.popup",
]);
function fieldsOfType(attrs: Record<string, any> | undefined, types: string[]): string[] {
  return Object.entries(attrs || {}).filter(([, a]: any) => types.includes(a?.type)).map(([k]) => k);
}
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

// serialize() above exists to satisfy a Strapi dynamic zone: it drops
// non-numeric `id`s (Strapi component row ids) and collapses a media object
// to its numeric upload id so Strapi can re-link the relation. Neither is
// true of a WordPress-hosted block — `id` is a hand-authored STRING anchor
// that public-site's withItems()/withFields() merge keys on (and that
// Blocks.tsx emits as the section's own DOM id), and images are plain
// absolute URL strings the static export writes out verbatim. A deep clone
// with no field surgery is the correct — and only — transformation here.
function serializeWire(b: Block): Record<string, any> {
  return JSON.parse(JSON.stringify(b));
}

// Drops the WebX Agent's local-only __agent proposal marker (set by
// applyAgentProposal below, read by the .ag-draft canvas tag) — every path
// that sends blocks to the server (pageBody(), saveVersion()) routes
// through this first so the marker never persists to Strapi/WordPress.
function stripAgentMarks(bl: Block[]): Block[] {
  return bl.map((b) => {
    if (!("__agent" in (b as any))) return b;
    const { __agent, ...rest } = b as any;
    return rest as Block;
  });
}

// Small immutable path-set, the one indirection point every block-mutation
// helper in this file (old and new) routes through — see updateBlock/
// updateBlockField below. `path` may index into arrays (numbers) or objects
// (strings), e.g. ["items", 2, "title"].
function getPath(obj: any, path: Path): any {
  return path.reduce((o: any, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj: any, path: Path, value: any): any {
  if (!path.length) return value;
  const [k, ...rest] = path;
  if (typeof k === "number") {
    const arr = Array.isArray(obj) ? obj.slice() : [];
    arr[k] = setPath(arr[k], rest, value);
    return arr;
  }
  const o = obj && typeof obj === "object" ? { ...obj } : {};
  o[k] = setPath(o[k], rest, value);
  return o;
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
  const agent = useAgentOptional();
  const { currentKey, current, engine } = useTenant();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Under a WordPress session BOTH Strapi uids are unreachable (the
  // WordPress adapter only knows its own wp: uids — resolvePostType throws)
  // — loadPages() below would swallow that error and the Builder would show
  // an empty page list forever with no indication why. Resolving from the
  // session's own engine instead of the ?uid= query param fixes that as a
  // side effect: a Strapi session gets the exact same expression as before
  // (?uid=api::page.page picks PAGE_UID, anything else LANDING_UID), so
  // that path is byte-for-byte unchanged and cannot regress.
  const uid = engine === "wordpress" ? WP_PAGE_UID : searchParams.get("uid") === PAGE_UID ? PAGE_UID : LANDING_UID;
  const isLanding = uid === LANDING_UID;
  const isWpPage = uid === WP_PAGE_UID;
  const [pages, setPages] = useState<Page[]>([]);
  const [sel, setSel] = useState<Page | null>(null);
  // The other-language toggle shown next to the page picker. Two different
  // mechanisms share this one piece of UI state, both keyed off sel.locale:
  // a Strapi page (api::page.page/api::landing.landing, i18n-enabled
  // 2026-09-14) has a REAL second documentId-linked entry, fetched via
  // open()'s existing cms.entries.get(uid, docId, {locale}) — reused
  // unchanged. A WordPress page has no such thing; "the other locale" is
  // just a second whole-array field (blocks_en) on the SAME entry, so
  // open()/pageBody() below pick between "blocks" and "blocks_en" by
  // sel.locale instead of re-fetching a different document.
  // localeMissing: true when a Strapi page's requested locale doesn't exist
  // yet — Strapi returns 200 with an empty {} body for that (confirmed by
  // reading @strapi/content-manager's findOne controller directly), NOT a
  // 404, so this can't be detected via a thrown CmsError; open() sets this
  // explicitly by checking for a missing documentId/id on the response.
  const [localeMissing, setLocaleMissing] = useState(false);
  const [creatingLocale, setCreatingLocale] = useState(false);
  // Mirrors `sel` for loadPages' own "is a page already open" check below —
  // a ref (not the state var) because loadPages must read the CURRENT
  // selection, not whatever `sel` was when its own closure was last
  // recreated (open()'s per-page template resolution, further down, now
  // changes `template` on every page switch for an unscoped session, which
  // would otherwise re-trigger loadPages via its existing `template`
  // dependency and silently reopen the default page out from under
  // whatever the user just switched to).
  const selRef = useRef<Page | null>(null);
  // Reset on a genuine content-type switch (uid comes from the URL's own
  // ?uid= — this component doesn't remount when it changes) so loadPages
  // still auto-opens a default page for the NEW list, same as before
  // selRef existed; only a same-uid reopen (the case selRef guards against
  // above) should skip it.
  useEffect(() => { selRef.current = null; }, [uid]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [active, setActive] = useState<number>(-1);
  const [device, setDevice] = useState<Device>("desktop");
  const [dragI, setDragI] = useState<number>(-1);
  const [insAt, setInsAt] = useState<number>(-1);
  // The inspector list's own insert picker, kept separate from the canvas's
  // `insAt` so the two can never open at once. It's the ONLY way to place a
  // block at a chosen position for a tenant whose canvas is the read-only
  // cross-origin harness iframe (orst/royalsociety) — there the canvas has
  // no insert affordance at all, so before this the list could reorder,
  // duplicate and delete but never add.
  const [sideInsAt, setSideInsAt] = useState<number>(-1);
  const [dragNew, setDragNew] = useState<{ comp?: string; custom?: BlockType; template?: PageTemplate } | null>(null);
  const [dropAt, setDropAt] = useState<number>(-1);
  const [dragBlock, setDragBlock] = useState<number>(-1);
  const [previewMode, setPreviewMode] = useState(false);
  const [uploadingI, setUploadingI] = useState<number>(-1);
  const [aiPrompt, setAiPrompt] = useState("");
  const [customTypes, setCustomTypes] = useState<BlockType[]>([]);
  const [showTypeEditor, setShowTypeEditor] = useState(false);
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  const [showIconManager, setShowIconManager] = useState(false);
  // Toolbox rail (components/Toolbox.tsx) — open by default: it's the
  // primary way to place anything, and hiding it behind a toggle by default
  // would just recreate the discoverability problem of the old palette
  // buried at the bottom of the inspector's scroll.
  // Closed by default: the palette costs 272px of a 3-column layout that the
  // app's own sidebar has already taken ~250px out of, which left the canvas
  // itself the NARROWEST column on a 1440px screen (it read as a phone-width
  // preview even in desktop mode). Most sessions open the Builder to edit
  // what's already on the page; adding a block is the less common path, and
  // it's one click away on the toolbar toggle (plus the + affordances
  // between blocks on the canvas).
  const [tbOpen, setTbOpen] = useState(false);
  // Distraction-free mode: the builder takes over the whole viewport,
  // hiding the app shell's nav rail and topbar. CSS-fixed rather than the
  // native Fullscreen API on purpose — requestFullscreen() hides the
  // browser's own chrome too (no address bar, no tab strip), which is
  // disorienting for a tool people keep open all day, and it can't be
  // entered without a user gesture on every re-render. Esc exits, matching
  // the modals in this same file.
  const [fullscreen, setFullscreen] = useState(false);

  const [templates, setTemplates] = useState<PageTemplate[]>([]);
  const [tplForm, setTplForm] = useState<{ name: string; description: string } | null>(null);
  const [tplManage, setTplManage] = useState(false);
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
  // Snapshot of whatever was last successfully loaded/saved — compared
  // against the live pageBody() to know if there are unsaved edits, so
  // switching pages / creating a new page / closing the tab can warn
  // instead of silently discarding work (see confirmDiscardIfDirty below).
  const savedSnapshotRef = useRef<string>("");
  const [abOpen, setAbOpen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    // Esc is already the exit key for preview mode and for every dialog in
    // this file (see the shared key handler further down). Those are the
    // *inner* layers — leaving one of them should not also drop the whole
    // builder out of full screen, so this only claims Esc once nothing else
    // is open to consume it.
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (previewMode || historyOpen || schedOpen || abOpen || showTypeEditor || showIconManager || tplForm || tplManage) return;
      setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling under the overlay.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [fullscreen, previewMode, historyOpen, schedOpen, abOpen, showTypeEditor, showIconManager, tplForm, tplManage]);
  const [abStats, setAbStats] = useState<{ A: { view: number; conversion: number }; B: { view: number; conversion: number } }>({ A: { view: 0, conversion: 0 }, B: { view: 0, conversion: 0 } });
  const [previewHomeData, setPreviewHomeData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Whether this tenant's publicTemplate is "gov-portal" — the only template
  // RealPreview has a ported renderer for (see the effect below). When true,
  // the real-styled canvas IS the primary editing surface (previewMode just
  // toggles its edit affordances on/off); when false, the .vbk-* mockup
  // canvas is the only editing surface, unchanged from before this feature.
  const [gpSupported, setGpSupported] = useState(false);
  // The tenant's publicTemplate, kept (not thrown away like before this
  // feature) so the block palette and blockDialect.ts's translation can key
  // off it too — set for real by the same tenant fetch gpSupported already
  // runs (see the effect below), but that fetch is async and loadPages()/
  // open() below can race ahead of it on first mount. isWpPage is already
  // known synchronously from the session's own engine (no fetch needed), so
  // default to "orst" as a placeholder whenever it's true — merely a guess
  // to keep `template` non-null for the brief window before the real value
  // resolves; templateReady below is what actually gates any use of it.
  const [template, setTemplate] = useState<Dialect>(uid === WP_PAGE_UID ? "orst" : "gov-portal");
  // Two WordPress templates (ORST, RoyalSociety) now share this pipeline, so
  // a wrong initial guess is no longer harmless (toBuilder/toWire would
  // namespace-translate with the WRONG prefix, corrupting the loaded blocks
  // — unlike the old single-WP-template case, where "wrong" only ever meant
  // "gov-portal identity" vs "orst," never one non-identity dialect vs
  // another). loadPages()/open() below must not read `template` until the
  // effect just below has resolved the tenant's REAL publicTemplate at least
  // once. A non-WP page's template never needs this (toBuilder/toWire are
  // identity for "gov-portal" regardless), so those start ready immediately.
  const [templateReady, setTemplateReady] = useState(!isWpPage);
  // Content types Collection List can bind to — global schema, not tenant
  // data, so a one-time fetch (no tenantKey dependency), unlike loadTypes/
  // loadIcons below.
  const [contentTypes, setContentTypes] = useState<ContentTypeInfo[]>([]);
  useEffect(() => {
    cms.schema.listContentTypes().then((all) => setContentTypes(all.filter((c) => LISTABLE_UIDS.has(c.uid)))).catch(() => {});
  }, []);
  // Per-collection-list-block entry data for the real-preview canvas, keyed
  // by block index — separate from previewHomeData since different blocks
  // can bind different content types/queries (previewHomeData is one fixed
  // tenant-wide fetch; this is N independent per-block fetches).
  const [collectionData, setCollectionData] = useState<Record<number, any[]>>({});
  const clSig = JSON.stringify(blocks.map((b, i) => (b.__component === "block.collection-list" ? [i, b.contentTypeUid, b.sortField, b.sortDir, b.pageSize] : null)).filter(Boolean));
  useEffect(() => {
    if (!gpSupported) { setCollectionData({}); return; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(blocks.map(async (b, i) => {
        if (b.__component !== "block.collection-list" || !b.contentTypeUid) return null;
        try {
          const { data } = await cms.entries.list<any>(b.contentTypeUid, { sort: (b.sortField || "createdAt") + ":" + (b.sortDir || "desc"), pageSize: b.pageSize || 12 });
          return [i, data] as const;
        } catch { return null; }
      }));
      if (!cancelled) setCollectionData(Object.fromEntries(entries.filter(Boolean) as [number, any[]][]));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpSupported, clSig]);
  const tenantKey = currentKey && currentKey !== "workspace" ? currentKey : "";

  const loadPages = useCallback(async () => {
    try {
      const { data } = await cms.entries.list<any>(uid, {
        page: 1, pageSize: 50, sort: "updatedAt:DESC",
        ...(tenantKey ? { filter: [{ field: "tenant.key", op: "eq" as const, value: tenantKey }] } : {}),
      });
      const list = data.map((e: any) => ({ docId: String(e.documentId ?? e.id), locale: e.locale, title: e.title || "#" + (e.documentId ?? e.id), tenantKey: e.tenantKey || undefined, slug: e.slug || undefined }));
      setPages(list);
      // Only auto-select a default page the FIRST time — a re-run of this
      // callback (e.g. open()'s own per-page template resolution below
      // changing `template`, which this callback depends on) must refresh
      // the list without yanking the user back to page 1 if they've already
      // opened something else. See selRef's own comment.
      //
      // Prefer the tenant's home page over list[0] — see lib/homePage.ts for
      // why the updatedAt:DESC order alone picks the wrong page here.
      if (!selRef.current) {
        const first = pickLandingPage(list, tenantKey);
        if (first) open(first);
      }
    } catch { setPages([]); }
    // `template` is a real dependency, not just an exhaustive-deps nag:
    // `open` is a plain (non-memoized) function redefined every render, so
    // its closure only has the CURRENT render's `template`. loadPages must
    // be recreated whenever `template` changes so its captured `open` isn't
    // stale — without this, loadPages (created once on mount, before the
    // tenant-template fetch below resolves) forever calls the `open` that
    // closed over the INITIAL placeholder guess, so toBuilder() would
    // permanently mistranslate every royalsociety block using the "orst."
    // prefix (verified live: a royalsociety-only type like "list-panel"
    // came back as the unrecognized component "orst.list-panel"). The
    // templateReady gate below only controls WHEN loadPages first runs;
    // this dependency is what makes sure it runs with the RIGHT template.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey, uid, template]);
  // Gated on templateReady — see that state's own comment. For a non-WP
  // page this is true from the first render, so this line is a no-op change
  // for every existing Strapi tenant.
  useEffect(() => { if (templateReady) loadPages(); }, [loadPages, templateReady]);

  async function createPage() {
    setSaving(true); setMsg(null);
    try {
      const e: any = await cms.entries.create(uid, isLanding ? { title: "Untitled page", active: true } : { title: "Untitled page" });
      const np = { docId: String(e.documentId ?? e.id), locale: e.locale, title: e.title || "Untitled page" };
      await loadPages();
      setPages((ps) => (ps.some((p) => p.docId === np.docId) ? ps : [np, ...ps])); // ensure selector shows it
      open(np); // open the new (empty) page directly
      setMsg({ t: t("vb.pagecreated"), ok: true });
    } catch (e) {
      if (e instanceof CmsError) setMsg({ t: "Could not create page (HTTP " + e.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setSaving(false); }
  }

  // The other-language toggle next to the page picker. WordPress just
  // re-opens the SAME entry with the other field selected (see open()'s
  // isWpPage branch) — no network round trip needed beyond the refetch
  // open() already does. Strapi re-opens with a different `locale`; if that
  // locale doesn't exist yet, open() sets localeMissing and this function's
  // sibling below (createLocale) offers to make it.
  function switchLocale(locale: "th" | "en") {
    if (!sel || sel.locale === locale || !confirmDiscardIfDirty()) return;
    open({ ...sel, locale });
  }
  // Strapi only (isWpPage's "other locale" already exists the moment the
  // page does — it's just an empty blocks_en field, not a missing entry).
  // Writes just a `title` so the locale exists at all — Strapi's own
  // updateDocument treats "documentId exists, no row in this locale yet" as
  // "create it" (confirmed by reading @strapi/content-manager's
  // controller directly), the exact mechanism write_draft_fields's own
  // `locale` param already relies on for the Agent. Reopens afterward so
  // the canvas reflects the now-real (empty) locale instead of staying on
  // the localeMissing placeholder.
  async function createLocale(locale: "en") {
    if (!sel) return;
    setCreatingLocale(true); setMsg(null);
    try {
      await cms.entries.update(uid, sel.docId, { title: sel.title }, { locale });
      await open({ ...sel, locale });
    } catch (e) {
      if (e instanceof CmsError) setMsg({ t: "Could not create the English version (HTTP " + e.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setCreatingLocale(false); }
  }

  const loadTypes = useCallback(async () => {
    try {
      // NOTE: intentionally left as a raw fetch — this $or/$null filter combo
      // (tenant-scoped OR global block types) isn't expressible via the
      // adapter's EntryQuery.filter (which only supports flat eq/ne/contains).
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

  const loadIcons = useCallback(async () => {
    try {
      let qs = "?pageSize=100&populate=image";
      if (tenantKey) qs += "&filters[$or][0][tenant][key][$eq]=" + encodeURIComponent(tenantKey) + "&filters[$or][1][tenant][id][$null]=true";
      const r = await fetch("/api/strapi/content-manager/collection-types/api::icon.icon" + qs);
      if (!r.ok) return;
      const j = await r.json();
      setCustomIcons((j.results ?? j.data ?? []).map((e: any) => ({ docId: String(e.documentId ?? e.id), key: e.key, name: e.name, imageUrl: e.image?.url, tenantKey: e.tenant?.key })));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);
  useEffect(() => { loadIcons(); }, [loadIcons]);

  // Saved page templates. Unlike loadTypes/loadIcons above (raw
  // /api/strapi/... fetches that 401 under a WordPress session), this goes
  // through cms.entries — page-template is a BOOKKEEPING uid in
  // governance.ts, so it resolves to Strapi with the service credential no
  // matter which engine this session logged in against, and a WordPress
  // tenant gets templates too. The "mine or shared" split is applied here
  // rather than in the query because EntryQuery.filter is flat AND-only and
  // can't express OR (same limitation loadTypes documents).
  const loadTemplates = useCallback(async () => {
    try {
      const { data } = await cms.entries.list<any>(TPL_UID, { pageSize: 100, sort: "updatedAt:DESC" });
      setTemplates(
        data
          .filter((e: any) => !e.tenantKey || !tenantKey || e.tenantKey === tenantKey)
          .map((e: any) => ({
            docId: String(e.documentId ?? e.id), key: e.key, name: e.name,
            description: e.description || "", dialect: e.dialect || "gov-portal",
            blocks: Array.isArray(e.blocks) ? e.blocks : [], tenantKey: e.tenantKey || "",
          }))
      );
    } catch { setTemplates([]); }
  }, [tenantKey]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  async function open(p: Page) {
    selRef.current = p;
    setSel(p); setLoading(true); setBlocks([]); setActive(-1); setMsg(null); clearUndo(); setLocaleMissing(false);
    try {
      // WordPress's own adapter ignores a 3rd (opts) argument entirely (it
      // has no per-locale-entry concept) — safe to pass unconditionally.
      const data: any = await cms.entries.get(uid, p.docId, p.locale ? { locale: p.locale } : undefined);
      // A Strapi page whose documentId exists but has no row in the
      // requested locale yet comes back 200 OK with an empty body (`{}`,
      // no documentId/id) — not a 404 — confirmed by reading
      // @strapi/content-manager's findOne controller directly. Show an
      // explicit "doesn't exist in this language yet" state rather than a
      // blank canvas indistinguishable from a genuinely empty page.
      if (!isWpPage && p.locale && !data?.documentId && !data?.id) {
        setLocaleMissing(true); setBlocks([]); setActive(-1);
        setOtherBlocks([]); setEditing("A"); setAbEnabled(false); setAbSplit(50);
        savedSnapshotRef.current = snapshotOf([], [], "A", false, 50, template);
        return;
      }
      // For a session with no single home tenant (the shared wpadmin/
      // scheduler login — tenantKey is "" since it isn't in any one
      // tenant's adminEmails, see governance.ts's resolveEffectiveTenant),
      // the tenant-level effect above never runs and `template` is stuck at
      // its useState hardcoded guess ("orst") no matter which page is
      // actually open — confirmed live during the ORST/RoyalSociety audit:
      // every RoyalSociety-only block on such a session showed as
      // unrecognized, and a saved template leaked across tenants. A
      // normally-scoped editor (tenantKey set) is unaffected — the effect
      // above already resolves `template` correctly for them. Resolve THIS
      // page's own tenant/dialect directly when we have one and the session
      // doesn't, rather than trusting the (possibly wrong) session-level
      // value.
      let pageTemplate = template;
      if (!tenantKey && p.tenantKey) {
        try {
          const { data: tenants } = await cms.entries.list<any>("api::tenant.tenant", { pageSize: 1, filter: [{ field: "key", op: "eq", value: p.tenantKey }] });
          const resolved = tenants[0]?.publicTemplate as Dialect | undefined;
          if (resolved) { pageTemplate = resolved; setTemplate(resolved); }
        } catch {}
      }
      // toBuilder is the identity function for template === "gov-portal"
      // (every existing Strapi tenant), so this is safe to call
      // unconditionally — see blockDialect.ts. A WordPress page's "other
      // locale" is the sibling blocks_en field on this SAME entry (see
      // wordpress.ts's ACF_FIELDS/ACF_JSON_FIELDS), not a second document.
      const rawBlocks = isWpPage && p.locale === "en" ? (data.blocks_en ?? []) : (data.blocks ?? []);
      const bl = toBuilder(rawBlocks as any[], pageTemplate) as Block[];
      setBlocks(bl); setActive(bl.length ? 0 : -1);
      let variantBlocks: Block[] = [];
      let ab = false, split = 50;
      if (isLanding) {
        variantBlocks = (data.variantBlocks ?? []) as Block[];
        ab = !!data.abEnabled;
        split = typeof data.abSplit === "number" ? data.abSplit : 50;
        setOtherBlocks(variantBlocks);
        setEditing("A");
        setAbEnabled(ab);
        setAbSplit(split);
      } else {
        setOtherBlocks([]); setEditing("A"); setAbEnabled(false); setAbSplit(50);
      }
      // Snapshot from the freshly-fetched data, not React state (which
      // hasn't committed the setBlocks/etc. calls above yet). open() always
      // resets to editing "A" above, so that's the side to snapshot against.
      savedSnapshotRef.current = snapshotOf(bl, variantBlocks, "A", ab, split, pageTemplate);
    } catch {} finally { setLoading(false); }
  }

  // ---- in-session undo/redo ----
  // Every block-list mutation (field edit, add, remove, reorder, duplicate)
  // pushes the PRE-mutation array here first. Rapid edits (e.g. typing)
  // coalesce into one undo step via the 600ms debounce in pushUndo — without
  // it, one Ctrl+Z would only ever remove a single keystroke, which is not
  // what "undo" means to a non-technical editor.
  const [undoStack, setUndoStack] = useState<Block[][]>([]);
  const [redoStack, setRedoStack] = useState<Block[][]>([]);
  const lastPushRef = useRef<number>(0);
  const pushUndo = useCallback((prevBlocks: Block[]) => {
    const now = Date.now();
    if (now - lastPushRef.current < 600) return;
    lastPushRef.current = now;
    setUndoStack((s) => [...s.slice(-49), prevBlocks]); // cap at 50 steps
    setRedoStack([]);
  }, []);
  function undo() {
    setUndoStack((s) => {
      if (!s.length) return s;
      const prev = s[s.length - 1];
      setRedoStack((r) => [...r, blocks]);
      setBlocks(prev);
      setActive((a) => Math.min(a, prev.length - 1));
      return s.slice(0, -1);
    });
  }
  function redo() {
    setRedoStack((s) => {
      if (!s.length) return s;
      const next = s[s.length - 1];
      setUndoStack((u) => [...u, blocks]);
      setBlocks(next);
      setActive((a) => Math.min(a, next.length - 1));
      return s.slice(0, -1);
    });
  }
  // Jumping to a different page/version/variant makes prior undo history
  // meaningless (undoing "past" that jump would silently land on a DIFFERENT
  // page's content) — clear it rather than let it dangle.
  function clearUndo() { setUndoStack([]); setRedoStack([]); }

  // The one indirection point for mutating a block's data — every other
  // mutation helper in this file (old bespoke ones below, and the real-
  // canvas edit callbacks passed to RealPreview) routes through these two,
  // so the sidebar and the inline-editable canvas can never drift out of
  // sync: both ultimately call setBlocks the same way.
  const updateBlock = useCallback((i: number, patcher: (b: Block) => Block) => {
    pushUndo(blocks);
    setBlocks((bs) => bs.map((b, j) => (j === i ? patcher(b) : b)));
  }, [blocks, pushUndo]);
  const updateBlockField = useCallback((i: number, path: Path, value: any) => {
    updateBlock(i, (b) => setPath(b, path, value));
  }, [updateBlock]);
  const uploadFieldImage = useCallback(async (i: number, path: Path, file: File) => {
    setUploadingI(i);
    try {
      if (isWpPage) {
        // cms.media.upload() below always hits /api/strapi/upload, which
        // carries a Strapi bearer token only — 401s under a WordPress
        // session. /api/cms/media is the engine-aware route (governed.
        // media.upload) added alongside this. Its result is written as a
        // plain URL string, not {id,url} — ORST's block components read
        // image fields as plain strings (Blocks.tsx: <img src={it.image}>),
        // never a Strapi media relation.
        const r = await fetch("/api/cms/media", { method: "POST", body: (() => { const fd = new FormData(); fd.append("files", file); return fd; })() });
        if (!r.ok) throw new CmsError("upload failed", r.status);
        const asset = await r.json();
        updateBlockField(i, path, asset.url as string);
      } else {
        const asset = await cms.media.upload(file);
        updateBlockField(i, path, { id: asset.id, url: asset.url });
      }
    } catch (e) {
      setMsg(e instanceof CmsError ? { t: "Image upload failed (HTTP " + e.status + ")", ok: false } : { t: "Could not upload image — check your connection and try again.", ok: false });
    } finally { setUploadingI(-1); }
  }, [updateBlockField, isWpPage]);
  // Generic array add/remove for the real-canvas's own array-field edit
  // affordances (feature-grid/stat-row items) — path points at the array
  // itself (e.g. ["items"]), not an item within it.
  const onArrayAdd = useCallback((i: number, path: Path, item: any) => {
    updateBlock(i, (b) => setPath(b, path, [...(getPath(b, path) || []), item]));
  }, [updateBlock]);
  const onArrayRemove = useCallback((i: number, path: Path, k: number) => {
    updateBlock(i, (b) => setPath(b, path, (getPath(b, path) || []).filter((_: any, kk: number) => kk !== k)));
  }, [updateBlock]);

  const setField = (i: number, k: string, v: any) => updateBlockField(i, [k], v);
  const move = (i: number, d: number) => { pushUndo(blocks); setBlocks((b) => { const n = [...b]; const j = i + d; if (j < 0 || j >= n.length) return b; [n[i], n[j]] = [n[j], n[i]]; setActive(j); return n; }); };
  const reorder = (from: number, to: number) => { pushUndo(blocks); setBlocks((b) => { if (from === to || from < 0) return b; const n = [...b]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; }); };
  const remove = (i: number) => { pushUndo(blocks); setBlocks((b) => b.filter((_, j) => j !== i)); setActive(-1); };
  const dup = (i: number) => { pushUndo(blocks); setBlocks((b) => { const c = JSON.parse(JSON.stringify(b[i])); delete c.id; const n = [...b]; n.splice(i + 1, 0, c); setActive(i + 1); return n; }); };
  const add = (comp: string) => { const m = metaOf(comp); pushUndo(blocks); setBlocks((b) => { setActive(b.length); return [...b, JSON.parse(JSON.stringify({ __component: comp, ...(m?.def || {}) }))]; }); };
  const addAt = (idx: number, comp: string) => { const m = metaOf(comp); pushUndo(blocks); setBlocks((b) => { const n = [...b]; n.splice(idx, 0, JSON.parse(JSON.stringify({ __component: comp, ...(m?.def || {}) }))); setActive(idx); return n; }); setInsAt(-1); };
  const addCustomAt = (idx: number, ct: BlockType) => { const props: Record<string, any> = {}; (ct.fieldsSchema || []).forEach((f) => (props[f.key] = f.type === "image" ? null : "")); pushUndo(blocks); setBlocks((b) => { const n = [...b]; n.splice(idx, 0, { __component: "block.custom", typeKey: ct.key, props }); setActive(idx); return n; }); };
  // Templates carry whole block arrays, so "insert at index" splices all of
  // them in at once rather than one block — the same gesture as any other
  // toolbox tile, just N blocks wide.
  const addTemplateAt = (idx: number, tpl: PageTemplate) => {
    const bl = (tpl.blocks || []).map((b: any) => JSON.parse(JSON.stringify(b)));
    if (!bl.length) return;
    pushUndo(blocks);
    setBlocks((b) => { const n = [...b]; n.splice(idx, 0, ...bl); setActive(idx); return n; });
    setInsAt(-1);
  };
  function handleDrop(idx: number) {
    if (dragBlock >= 0) { const to = idx > dragBlock ? idx - 1 : idx; reorder(dragBlock, to); setActive(to); }
    else if (dragNew?.comp) addAt(idx, dragNew.comp);
    else if (dragNew?.custom) addCustomAt(idx, dragNew.custom);
    else if (dragNew?.template) addTemplateAt(idx, dragNew.template);
    setDragNew(null); setDragBlock(-1); setDropAt(-1);
  }
  /** Append a template's blocks, or replace the page with them. Both are
   * undoable like any other edit — nothing here writes to the server until
   * the normal Save/Publish, so a mis-clicked "Replace" is one Ctrl+Z away. */
  function applyTemplate(tpl: PageTemplate, mode: "replace" | "append") {
    const bl = (tpl.blocks || []).map((b: any) => JSON.parse(JSON.stringify(b)));
    if (!bl.length) return;
    if (mode === "replace" && blocks.length && !window.confirm(t("tbx.confirmreplace"))) return;
    pushUndo(blocks);
    setBlocks((b) => (mode === "replace" ? bl : [...b, ...bl]));
    setActive(mode === "replace" ? 0 : blocks.length);
    setMsg({ t: t("tbx.tplapplied"), ok: true });
  }
  async function saveTemplate() {
    if (!tplForm) return;
    setSaving(true); setMsg(null);
    try {
      await cms.entries.create(TPL_UID, {
        key: (tplForm.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "template") + "-" + Math.random().toString(36).slice(2, 6),
        name: tplForm.name.trim(), description: tplForm.description.trim(),
        // The dialect the CURRENT canvas is authored in — a gov-portal
        // template's block.* components are meaningless on an ORST page, so
        // Toolbox only ever offers back the ones matching this tenant.
        // Stored in BUILDER dialect (what the canvas holds), not pageBody()'s
        // wire dialect, so applying one is a straight splice with no
        // translate round-trip. `id` is dropped per block for the same
        // reason dup() drops it: these become NEW components wherever the
        // template is applied, and a reused Strapi component-row id would
        // re-link the original page's row instead of creating one.
        dialect: template, tenantKey,
        blocks: blocks.map((b) => { const c = JSON.parse(JSON.stringify(b)); delete c.id; return c; }),
      });
      setTplForm(null); await loadTemplates();
      setMsg({ t: t("tbx.tplsaved"), ok: true });
    } catch (e) {
      setMsg({ t: e instanceof CmsError ? "Could not save template (HTTP " + e.status + ")" : "Cannot reach the backend.", ok: false });
    } finally { setSaving(false); }
  }
  async function deleteTemplate(tpl: PageTemplate) {
    if (!tpl.docId || !window.confirm(t("tbx.confirmdeltpl"))) return;
    try { await cms.entries.remove(TPL_UID, tpl.docId); await loadTemplates(); setMsg({ t: t("tbx.tpldeleted"), ok: true }); }
    catch { setMsg({ t: "Could not delete template.", ok: false }); }
  }
  async function shareTemplate(tpl: PageTemplate) {
    if (!tpl.docId) return;
    try { await cms.entries.update(TPL_UID, tpl.docId, { tenantKey: "" }); await loadTemplates(); setMsg({ t: t("bt.shared"), ok: true }); }
    catch { setMsg({ t: "Could not share template.", ok: false }); }
  }
  const uploadImg = (i: number, file: File) => uploadFieldImage(i, ["image"], file);
  // custom blocks
  const addCustom = (ct: BlockType) => { const props: Record<string, any> = {}; (ct.fieldsSchema || []).forEach((f) => (props[f.key] = f.type === "image" ? null : "")); pushUndo(blocks); setBlocks((b) => { setActive(b.length); return [...b, { __component: "block.custom", typeKey: ct.key, props }]; }); };
  const setProp = (i: number, key: string, val: any) => updateBlockField(i, ["props", key], val);
  const uploadProp = (i: number, key: string, file: File) => uploadFieldImage(i, ["props", key], file);
  const iconOf = (b: Block) => b.__component === "block.custom" ? (customTypes.find((c) => c.key === b.typeKey)?.icon || "grid") : (metaOf(b.__component)?.icon || "doc");
  const labelOf = (b: Block) => b.__component === "block.custom" ? (customTypes.find((c) => c.key === b.typeKey)?.name || "Custom") : (metaOf(b.__component) ? t(metaOf(b.__component)!.key) : b.__component);
  // Block names for the harness preview's selection tab — kept referentially
  // stable while unchanged, since RealPreview re-posts the whole page to its
  // iframe whenever this array's identity changes.
  const labelsKey = blocks.map(labelOf).join("\u0001");
  const blockLabels = useMemo(() => (labelsKey ? labelsKey.split("\u0001") : []), [labelsKey]);
  const wireBlocks = useMemo(() => toWire(blocks, template), [blocks, template]);
  // Figma-style component editing on the harness preview: which component
  // of which block is picked (sidebar and preview both drive it), and where
  // a finished move/resize lands — `b.boxes[device][key]`, rendered by
  // public-site/templates/_builder/boxes.ts. Goes through updateBlockField,
  // so undo/redo and the unsaved-changes guard see it like any other edit.
  const [selComp, setSelComp] = useState<{ i: number; key: string } | null>(null);
  useEffect(() => { setSelComp((c) => (c && c.i === active ? c : null)); }, [active]);
  const activeComp = selComp && selComp.i === active ? selComp.key : null;
  const onComponent = useCallback((i: number, key: string | null) => setSelComp(key ? { i, key } : null), []);
  const setBox = useCallback((i: number, key: string, dev: string, box: any) => {
    updateBlockField(i, ["boxes", dev, key], box && Object.keys(box).length ? box : undefined);
  }, [updateBlockField]);
  // Keep the selected block's editor in view in the sidebar — selection can
  // come from the canvas/preview (a click on a section there), which would
  // otherwise leave the sidebar showing some other block. Scrolls only the
  // sidebar's own scroll box (.vb-insp is sticky + overflow:auto), never the
  // page, so it can't fight the preview's own scroll-to-block.
  const inspRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const insp = inspRef.current;
    const el = insp?.querySelector<HTMLElement>(".vb-block.sel");
    if (!insp || !el) return;
    const top = el.getBoundingClientRect().top - insp.getBoundingClientRect().top;
    // Leave it alone if the block's header is already comfortably visible.
    if (top >= 0 && top < insp.clientHeight * 0.4) return;
    insp.scrollTo({ top: insp.scrollTop + top - 8, behavior: "smooth" });
  }, [active]);
  // Was a direct single-block generator (POST /api/ai/generate → append one
  // block, no review, no governance path at all — it wrote straight into
  // this component's own local `blocks` state same as any manual edit).
  // Phase 8 replaces it with "Ask the agent": opens the docked panel with
  // this prompt and lets the real WebX Agent handle it instead — page-
  // building tools aren't in its registry yet (lib/agent/tools.ts's own
  // header comment — a deliberate follow-up alongside their own UI wiring),
  // so today this just starts a conversation; once those tools land, the
  // exact same entry point starts proposing real blocks with Apply/Undo.
  function askAgent() {
    const p = aiPrompt.trim(); if (!p) return;
    agent?.openWith({ prompt: p, autosend: true });
    setAiPrompt("");
  }
  // feature items — thin wrappers over updateBlock/updateBlockField (see
  // those definitions above): same external call signatures as before this
  // refactor, so no sidebar JSX below needed to change, but now the exact
  // same primitives the real-canvas edit affordances call through too — one
  // mutation path, not two.
  const setItem = (i: number, k: number, field: string, v: string) => updateBlockField(i, ["items", k, field], v);
  const addItem = (i: number) => updateBlock(i, (x) => ({ ...x, items: [...(x.items || []), { title: "Feature", text: "" }] }));
  const rmItem = (i: number, k: number) => updateBlock(i, (x) => ({ ...x, items: (x.items || []).filter((_: any, kk: number) => kk !== k) }));

  // stat-row items (block.stat-row's own items array — icon/value/label)
  const setStatItem = (i: number, k: number, field: string, v: string) => updateBlockField(i, ["items", k, field], v);
  const addStatItem = (i: number) => updateBlock(i, (x) => ({ ...x, items: [...(x.items || []), { icon: "users", value: "0", label: "Label" }] }));
  const rmStatItem = (i: number, k: number) => updateBlock(i, (x) => ({ ...x, items: (x.items || []).filter((_: any, kk: number) => kk !== k) }));

  // featured-promo's checklist items — a plain string[], not objects
  const setChecklistItem = (i: number, k: number, v: string) => updateBlockField(i, ["items", k], v);
  const addChecklistItem = (i: number) => updateBlock(i, (x) => ({ ...x, items: [...(x.items || []), "Checklist item"] }));
  const rmChecklistItem = (i: number, k: number) => updateBlock(i, (x) => ({ ...x, items: (x.items || []).filter((_: any, kk: number) => kk !== k) }));

  // testimonials items
  const setTestiItem = (i: number, k: number, field: string, v: string) => updateBlockField(i, ["items", k, field], v);
  const addTestiItem = (i: number) => updateBlock(i, (x) => ({ ...x, items: [...(x.items || []), { quote: "", author: "", role: "" }] }));
  const rmTestiItem = (i: number, k: number) => updateBlock(i, (x) => ({ ...x, items: (x.items || []).filter((_: any, kk: number) => kk !== k) }));
  const uploadTestiAvatar = (i: number, k: number, file: File) => uploadFieldImage(i, ["items", k, "avatar"], file);

  // logo-cloud items
  const setLogoItem = (i: number, k: number, field: string, v: string) => updateBlockField(i, ["items", k, field], v);
  const addLogoItem = (i: number) => updateBlock(i, (x) => ({ ...x, items: [...(x.items || []), { name: "", url: "" }] }));
  const rmLogoItem = (i: number, k: number) => updateBlock(i, (x) => ({ ...x, items: (x.items || []).filter((_: any, kk: number) => kk !== k) }));
  const uploadLogoImg = (i: number, k: number, file: File) => uploadFieldImage(i, ["items", k, "logo"], file);

  // team-grid items
  const setTeamItem = (i: number, k: number, field: string, v: string) => updateBlockField(i, ["items", k, field], v);
  const addTeamItem = (i: number) => updateBlock(i, (x) => ({ ...x, items: [...(x.items || []), { name: "", role: "" }] }));
  const rmTeamItem = (i: number, k: number) => updateBlock(i, (x) => ({ ...x, items: (x.items || []).filter((_: any, kk: number) => kk !== k) }));
  const uploadTeamPhoto = (i: number, k: number, file: File) => uploadFieldImage(i, ["items", k, "photo"], file);

  // tabs/accordion items
  const setTabItem = (i: number, k: number, field: string, v: string) => updateBlockField(i, ["items", k, field], v);
  const addTabItem = (i: number) => updateBlock(i, (x) => ({ ...x, items: [...(x.items || []), { title: "New tab", body: "" }] }));
  const rmTabItem = (i: number, k: number) => updateBlock(i, (x) => ({ ...x, items: (x.items || []).filter((_: any, kk: number) => kk !== k) }));

  // comparison columns + each column's own features[] (an array nested
  // inside an array item — setPath/getPath already handle arbitrary depth).
  const setCmpCol = (i: number, k: number, field: string, v: any) => updateBlockField(i, ["columns", k, field], v);
  const addCmpCol = (i: number) => updateBlock(i, (x) => ({ ...x, columns: [...(x.columns || []), { name: "New option", features: [] }] }));
  const rmCmpCol = (i: number, k: number) => updateBlock(i, (x) => ({ ...x, columns: (x.columns || []).filter((_: any, kk: number) => kk !== k) }));
  const setCmpFeature = (i: number, k: number, fi: number, v: string) => updateBlockField(i, ["columns", k, "features", fi], v);
  const addCmpFeature = (i: number, k: number) => updateBlock(i, (x) => ({ ...x, columns: (x.columns || []).map((c: any, kk: number) => kk === k ? { ...c, features: [...(c.features || []), ""] } : c) }));
  const rmCmpFeature = (i: number, k: number, fi: number) => updateBlock(i, (x) => ({ ...x, columns: (x.columns || []).map((c: any, kk: number) => kk === k ? { ...c, features: (c.features || []).filter((_: any, ffi: number) => ffi !== fi) } : c) }));

  // build the update body. Landing writes BOTH variants (A = dynamic zone, B =
  // json) + A/B config; a plain page only has `blocks` — no splash-only fields.
  // A WordPress page (wp:page, always !isLanding) writes back through
  // serializeWire + toWire instead of serialize — see both functions' own
  // comments for why the Strapi-shaped one is wrong here.
  function pageBody() {
    // The WordPress "other locale" is a sibling field (blocks_en) on the
    // SAME entry, not a second document — see open()'s matching read side.
    if (isWpPage) return { [sel?.locale === "en" ? "blocks_en" : "blocks"]: toWire(stripAgentMarks(blocks).map(serializeWire), template) };
    if (!isLanding) return { blocks: stripAgentMarks(blocks).map(serialize), ...(sel?.locale ? { locale: sel.locale } : {}) };
    const aBlocks = editing === "A" ? stripAgentMarks(blocks) : otherBlocks;
    const bBlocks = editing === "B" ? stripAgentMarks(blocks) : otherBlocks;
    return { blocks: aBlocks.map(serialize), variantBlocks: bBlocks, abEnabled, abSplit, ...(sel?.locale ? { locale: sel.locale } : {}) };
  }
  // Same shape as pageBody() minus `locale` (never changes via editing, so
  // irrelevant to dirty-detection) — a pure function of explicit args so
  // open() can snapshot freshly-fetched data before React state commits.
  // Must use the identical serializer pageBody() uses for isDirty to ever
  // resolve false after a real save. `dialect` defaults to the outer
  // `template` (correct for every call outside open()) but MUST be passed
  // explicitly there: open() calls this synchronously right after its own
  // setTemplate(pageTemplate), and a React state update doesn't change what
  // `template` resolves to inside a still-executing closure — using the
  // default would silently snapshot against the PRE-update dialect while
  // `bl` itself was already built with the correct one, permanently
  // mismatching every unscoped-session per-page resolution (see open()'s
  // own comment) and showing a phantom "unsaved changes" on a freshly
  // opened, untouched page.
  function snapshotOf(bl: Block[], variantBl: Block[], editingSide: "A" | "B", ab: boolean, split: number, dialect: Dialect = template): string {
    if (isWpPage) return JSON.stringify({ blocks: toWire(bl.map(serializeWire), dialect) });
    if (!isLanding) return JSON.stringify({ blocks: bl.map(serialize) });
    const aBlocks = editingSide === "A" ? bl : variantBl;
    const bBlocks = editingSide === "B" ? bl : variantBl;
    return JSON.stringify({ blocks: aBlocks.map(serialize), variantBlocks: bBlocks, abEnabled: ab, abSplit: split });
  }
  const isDirty = useMemo(() => !!sel && snapshotOf(blocks, otherBlocks, editing, abEnabled, abSplit) !== savedSnapshotRef.current,
    [blocks, otherBlocks, editing, abEnabled, abSplit, sel]);
  // Gate for any action that would discard the canvas (switch page, create a
  // new page, navigate away) — a no-op confirm when there's nothing unsaved.
  function confirmDiscardIfDirty(): boolean {
    return !isDirty || window.confirm(t("vb.unsavedwarn"));
  }
  // A link clicked in the harness preview's own header/footer/menu (the
  // harness never lets the iframe itself navigate). Public routes map to
  // WordPress slugs as `/<tenant>/<page>` → "<tenant>-<page>" and
  // `/<tenant>` → "<tenant>-home" (public-site/lib/cms.ts's getWpPage /
  // listWpPageSlugs); an `/en` prefix is the same page's other locale.
  function navigateTo(path: string) {
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "en") parts.shift();
    if (!parts.length) return;
    const slug = parts[0] + "-" + (parts[1] || "home");
    const p = pages.find((x) => x.slug === slug);
    if (!p) { setMsg({ t: t("vb.navmissing").replace("{p}", path), ok: false }); return; }
    if (p.docId === sel?.docId) return;
    if (confirmDiscardIfDirty()) open(p);
  }
  /** Switches which page-shaped content type this canvas edits. The two live
   * in separate tables, so the current selection can't survive the switch —
   * clearing it lets loadPages() (which only auto-opens when nothing is
   * selected) open the new surface's first page. Until this existed the
   * choice was reachable ONLY by hand-editing ?uid= in the URL, while the
   * default landed on Landings — so an agent-created api::page.page entry
   * looked missing even though it was right there in another surface. */
  function switchSurface(next: string) {
    if (next === uid || !confirmDiscardIfDirty()) return;
    setSel(null);
    selRef.current = null;
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("uid", next);
    router.push("?" + qs.toString());
  }
  // Warn on tab close/refresh too — the in-app guards above don't cover that.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) { if (isDirty) { e.preventDefault(); e.returnValue = ""; } }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // WebX Agent (Phase 8) — applies an insert_blocks/replace_block/remove_block
  // proposal (lib/agent/tools.ts) to this canvas. Deliberately does NOT call
  // pushUndo(blocks) here (unlike every other mutation helper in this file):
  // this function is handed to AgentProvider at REGISTRATION time (whenever
  // [uid, sel?.docId, sel?.locale] last changed, via useAgentContext below),
  // not re-created on every render the way an onClick handler is — normal
  // editing between then and whenever a proposal is actually applied would
  // leave a directly-closed-over `blocks` stale, and pushUndo takes its
  // snapshot as a plain argument rather than reading state itself, so a
  // stale one would corrupt the Ctrl+Z stack with the wrong "previous"
  // state. setBlocks's own functional-updater form sidesteps that for the
  // actual mutation; the dedicated `undo` this returns (for the proposal
  // card's own Undo button) is what stays safe to rely on here, not Ctrl+Z.
  const applyAgentProposal = useCallback((p: AgentProposal): { undo: () => void } | void => {
    if (p.kind !== "blocks" || !Array.isArray(p.blocks)) return;
    // __agent marks the block as agent-authored (see .ag-draft's own CSS —
    // a visible tag on the canvas until accepted the same way a review
    // approves any other draft) and is stripped before it's ever sent back
    // to the server (pageBody()/saveVersion() below).
    const marked = p.blocks.map((b: any) => ({ ...b, __agent: p.id }));
    let snapshot: Block[] = [];
    setBlocks((bs) => {
      snapshot = bs;
      if (typeof p.replace === "number") {
        const next = bs.slice();
        next.splice(Math.max(0, Math.min(p.replace, Math.max(bs.length - 1, 0))), 1, ...marked);
        return next;
      }
      const at = Math.max(0, Math.min(typeof p.at === "number" ? p.at : bs.length, bs.length));
      return [...bs.slice(0, at), ...marked, ...bs.slice(at)];
    });
    setActive(typeof p.replace === "number" ? p.replace : (typeof p.at === "number" ? p.at : 0));
    return { undo: () => setBlocks(snapshot) };
  }, []);
  // {kind:"page"} registration — lets the docked panel/workspace show a real
  // context chip for the open page and, via applyLocally=isDirty, downgrades
  // the agent's own draft-level page writes to a proposal whenever this
  // canvas holds unsaved edits (same contract as EntryEditor.tsx's own
  // registration; applyLocally can only ever narrow what the agent does,
  // never widen it).
  // Registered even with nothing open ({kind:"none"} rather than null): the
  // panel calls refresh() after any run that actually wrote something
  // (AgentProvider's handleDone → done.applied), and a run whose only write
  // was create_draft_entry produces a page this canvas has never heard of.
  // Registering only when `sel` exists meant that case refreshed nothing at
  // all, so an agent-created page stayed invisible here until a manual
  // reload — reported live ("ขึ้นแค่ใน review ไม่ขึ้นใน visual builder").
  // refresh() now reloads the page LIST too, not just the open page:
  // loadPages() re-lists (sorted updatedAt:DESC, so a new page lands first)
  // and auto-opens it when nothing is selected, while an open page is
  // re-read in place so an agent edit shows without yanking the editor
  // somewhere else.
  useAgentContext(
    sel ? { kind: "page", uid, docId: sel.docId, locale: sel.locale, applyLocally: isDirty } : { kind: "none" },
    { applyProposal: applyAgentProposal, refresh: () => { loadPages(); if (selRef.current) open(selRef.current); } },
    [uid, sel?.docId, sel?.locale, isDirty, loadPages]
  );

  async function save() {
    if (!sel) return;
    setSaving(true); setMsg(null);
    try {
      await cms.entries.update(uid, sel.docId, pageBody(), sel.locale ? { locale: sel.locale } : undefined);
      savedSnapshotRef.current = snapshotOf(blocks, otherBlocks, editing, abEnabled, abSplit);
      setMsg({ t: t("vb.saved"), ok: true });
    } catch (e) {
      if (e instanceof CmsError) setMsg({ t: "Save failed (HTTP " + e.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setSaving(false); }
  }

  async function publish() {
    if (!sel) return;
    setSaving(true); setMsg(null);
    const opts = sel.locale ? { locale: sel.locale } : undefined;
    try {
      await cms.entries.update(uid, sel.docId, pageBody(), opts);
      savedSnapshotRef.current = snapshotOf(blocks, otherBlocks, editing, abEnabled, abSplit);
    } catch (e) {
      setMsg(e instanceof CmsError ? { t: "Save failed (HTTP " + e.status + ")", ok: false } : { t: "Cannot reach the backend.", ok: false });
      setSaving(false); return;
    }
    try {
      await cms.publish.publish(uid, sel.docId, opts);
      setMsg({ t: t("vb.published"), ok: true });
      await saveVersion("Published");
    } catch (e) {
      setMsg(e instanceof CmsError ? { t: "Publish failed (HTTP " + e.status + ")", ok: false } : { t: "Cannot reach the backend.", ok: false });
    }
    finally { setSaving(false); }
  }

  // ---- version history (snapshots) ----
  async function saveVersion(label: string) {
    if (!sel) return;
    try {
      // tenantKey: page-version is a Strapi bookkeeping type shared across
      // every tenant and engine (see governance.ts's BOOKKEEPING_UIDS) —
      // stamped on every write (cheap, and lets a future backfill happen),
      // but only actually FILTERED on for wp: uids below, where it matters —
      // see loadHistory's comment for why.
      await cms.entries.create(PV_UID, { documentRef: sel.docId, contentType: uid, tenantKey: currentKey, label, data: { title: sel.title, blocks: stripAgentMarks(blocks) } });
    } catch {}
  }
  async function loadHistory() {
    if (!sel) return;
    setHistoryOpen(true); setVersions([]);
    try {
      const filter = [
        { field: "documentRef", op: "eq" as const, value: sel.docId },
        { field: "contentType", op: "eq" as const, value: uid },
        // Strapi's own page/landing document ids are effectively unique, so
        // contentType+documentRef alone is already safe there — and every
        // page-version row saved before this field existed has no
        // tenantKey, so filtering on it unconditionally would hide a
        // Strapi page's own pre-existing history. A WordPress page's id is
        // a small integer that CAN collide with another tenant's page on
        // the same shared WordPress instance, so it's the one case this
        // extra filter is required for.
        ...(uid.startsWith("wp:") ? [{ field: "tenantKey", op: "eq" as const, value: currentKey }] : []),
      ];
      const { data } = await cms.entries.list<any>(PV_UID, { sort: "createdAt:DESC", pageSize: 50, filter });
      setVersions(data.map((e: any) => ({ id: e.documentId ?? e.id, label: e.label, createdAt: e.createdAt, data: e.data })));
    } catch {}
  }
  function restore(v: any) {
    const b = v?.data?.blocks;
    if (Array.isArray(b)) { setBlocks(b as Block[]); setActive(b.length ? 0 : -1); setHistoryOpen(false); setMsg({ t: t("vb.restored"), ok: true }); clearUndo(); }
  }

  // ---- scheduled publishing (publishStart / publishEnd) ----
  async function openSchedule() {
    if (!sel) return;
    setSchedOpen(true); setSched({ start: "", end: "" });
    try {
      const d: any = await cms.entries.get(uid, sel.docId, sel.locale ? { locale: sel.locale } : undefined);
      setSched({ start: toLocalInput(d.publishStart), end: toLocalInput(d.publishEnd) });
    } catch {}
  }
  async function saveSchedule() {
    if (!sel) return;
    setSaving(true); setMsg(null);
    try {
      const body: any = { publishStart: sched.start ? new Date(sched.start).toISOString() : null, publishEnd: sched.end ? new Date(sched.end).toISOString() : null };
      await cms.entries.update(uid, sel.docId, body, sel.locale ? { locale: sel.locale } : undefined);
      setMsg({ t: t("vb.schedsaved"), ok: true });
      setSchedOpen(false);
    } catch (e) {
      if (e instanceof CmsError) setMsg({ t: "Save failed (HTTP " + e.status + ")", ok: false });
      else setMsg({ t: "Cannot reach the backend.", ok: false });
    }
    finally { setSaving(false); }
  }

  // ---- A/B testing ----
  function setEditingVariant(v: "A" | "B") {
    if (v === editing) return;
    setOtherBlocks(blocks);            // stash the array we're leaving
    setBlocks(otherBlocks);            // load the other variant onto the canvas
    setActive(otherBlocks.length ? 0 : -1);
    setEditing(v);
    clearUndo(); // undo history from the OTHER variant doesn't apply here
  }
  async function loadAbStats() {
    if (!sel) return;
    try {
      const { data: ev } = await cms.entries.list<any>(AB_UID, { pageSize: 2000, filter: [{ field: "documentRef", op: "eq", value: sel.docId }] });
      const agg = { A: { view: 0, conversion: 0 }, B: { view: 0, conversion: 0 } };
      ev.forEach((e) => { const v = e.variant === "B" ? "B" : "A"; const k = e.kind === "conversion" ? "conversion" : "view"; (agg as any)[v][k]++; });
      setAbStats(agg);
    } catch {}
  }
  function openAb() { if (!sel) return; setAbOpen(true); loadAbStats(); }

  // Real preview (webx-studio/components/blockPreview/RealPreview.tsx) only
  // has a ported renderer for the gov-portal template today — ORST/
  // RoyalSociety have entirely different CSS/markup this doesn't cover yet.
  // `publicTemplate` isn't tracked anywhere else in webx-studio, so this is
  // the one place that needs to ask for it. Runs on tenant load, not gated
  // behind the previewMode toggle — RealPreview is now the primary editing
  // canvas for gov-portal tenants, always shown, not just when "previewing".
  useEffect(() => {
    if (!tenantKey) { setGpSupported(false); setTemplateReady(true); return; }
    let cancelled = false;
    (async () => {
      setPreviewLoading(true); setGpSupported(false); setPreviewHomeData(null);
      try {
        const { data: tenants } = await cms.entries.list<any>("api::tenant.tenant", { pageSize: 1, filter: [{ field: "key", op: "eq", value: tenantKey }] });
        const tpl = (tenants[0]?.publicTemplate || "gov-portal") as Dialect;
        if (!cancelled) { setTemplate(tpl); setTemplateReady(true); }
        if (tpl !== "gov-portal") return;
        if (!cancelled) setGpSupported(true);
        // tenantFilter is required, not optional — an unscoped caller (e.g.
        // the scheduler account) sees every tenant's rows unfiltered
        // otherwise, and this list() call has no other tenant scoping.
        const tenantFilter = { field: "tenant.key", op: "eq" as const, value: tenantKey };
        const [banners, articles, videos, awards, faqs] = await Promise.all([
          cms.entries.list<any>("api::banner.banner", { pageSize: 100, sort: "order:asc", filter: [tenantFilter, { field: "active", op: "eq", value: true }] }),
          cms.entries.list<any>("api::article.article", { pageSize: 100, sort: "publishDate:desc", filter: [tenantFilter] }),
          cms.entries.list<any>("api::video.video", { pageSize: 100, sort: "date:desc", filter: [tenantFilter] }),
          cms.entries.list<any>("api::award.award", { pageSize: 100, sort: "order:asc", filter: [tenantFilter] }),
          cms.entries.list<any>("api::faq.faq", { pageSize: 100, sort: "order:asc", filter: [tenantFilter] }),
        ]);
        if (!cancelled) setPreviewHomeData({ banners: banners.data, articles: articles.data, videos: videos.data, awards: awards.data, faqs: faqs.data });
      } catch { if (!cancelled) { setPreviewHomeData({}); setTemplateReady(true); } }
      finally { if (!cancelled) setPreviewLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenantKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { if (previewMode) setPreviewMode(false); if (historyOpen) setHistoryOpen(false); if (schedOpen) setSchedOpen(false); if (abOpen) setAbOpen(false); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      // Ctrl+S always overrides the browser's own "save page" dialog — this
      // is the one shortcut that should fire even while typing in a field.
      if (k === "s") { e.preventDefault(); if (sel) save(); return; }
      // Everything else here yields to native in-field behavior (browser's
      // own undo-while-typing, Backspace deleting a character, etc.) — only
      // acts when focus isn't inside a text input/textarea/contentEditable.
      const el = document.activeElement as HTMLElement | null;
      const isTyping = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (isTyping) return;
      if (k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (k === "y") { e.preventDefault(); redo(); return; }
      if (k === "d" && active >= 0) { e.preventDefault(); dup(active); return; }
    }
    // Delete/Backspace for the selected block is a separate, lower-priority
    // listener (no modifier key involved) — same isTyping guard, so it never
    // hijacks normal text deletion inside a field.
    function onKeyDel(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (active < 0) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      remove(active);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onKeyDel);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keydown", onKeyDel); };
  }, [previewMode, historyOpen, schedOpen, abOpen, active, sel]);

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
    if (c === "block.richtext") return <div className="vbk-rich" dangerouslySetInnerHTML={{ __html: b.body ? sanitizeCmsHtml(b.body) : "<p style='color:#999'>Rich text… (edit in panel)</p>" }} />;
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
      return <div className="vbk-custom" dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(interpolate(bt, b.props || {})) }} />;
    }
    if (c === "block.stat-row") {
      const items = Array.isArray(b.items) ? b.items : [];
      return (
        <div className="vbk-features">
          <div className="vbk-grid" style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)},1fr)` }}>
            {items.map((it: any, k: number) => (
              <div className="vbk-feat" key={k}>
                <div className="ic"><Icon name={it.icon === "clock" ? "clock" : it.icon === "shield" ? "shield" : "grid"} /></div>
                <InlineText as="b" value={it.value || ""} onChange={(v) => setStatItem(i, k, "value", v)} placeholder="Value" />
                <InlineText as="span" value={it.label || ""} onChange={(v) => setStatItem(i, k, "label", v)} placeholder="Label" />
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (c === "block.featured-promo") return (
      <div className="vbk-cta">
        <div style={{ flex: 1 }}>
          <InlineText as="span" className="vbk-kicker" value={b.eyebrow || ""} onChange={(v) => setField(i, "eyebrow", v)} placeholder="EYEBROW" />
          <InlineText as="h2" value={b.title || ""} onChange={(v) => setField(i, "title", v)} placeholder="Heading" />
          <InlineText as="p" value={b.description || ""} onChange={(v) => setField(i, "description", v)} placeholder="Description…" />
        </div>
        <InlineText as="span" className="vbk-btn" value={b.primaryLabel || ""} onChange={(v) => setField(i, "primaryLabel", v)} placeholder="Primary button" />
      </div>
    );
    if (c === "block.embed") return (
      <div className="vbk-rich vbk-livedata">
        <b><Icon name="code" />{" "}{b.label || t("vb.embed")}</b>
        <span className="muted" style={{ display: "block", marginTop: 4 }}>{t("vb.embedwarn")}</span>
      </div>
    );
    if (c === "block.form") return (
      <div className="vbk-rich vbk-livedata">
        <b><Icon name="inbox" />{" "}{b.heading || FORM_FIELD_DEFS[b.contentTypeUid]?.label || t("vb.form")}</b>
        <span className="muted" style={{ display: "block", marginTop: 4 }}>{t("vb.formwarn")}</span>
      </div>
    );
    if (LIVE_DATA_COMPS.has(c)) return (
      <div className="vbk-rich vbk-livedata">
        <b>{compName(c)}</b>
        <span className="muted" style={{ display: "block", marginTop: 4 }}>{t("vb.livedata")}</span>
      </div>
    );
    // Generic mockup-canvas fallback for every ORST block type (this branch
    // never fires for gov-portal, which is exhaustively handled above) —
    // covers all 14 without one bespoke preview each. Most share a
    // heading/lead "section head" shape (Blocks.tsx's own SectionHead), but
    // cta-band (heading/body) and notice (title/body) don't, and
    // contact-info has neither — so this picks whichever title-like and
    // body-like field the block's OWN fields list (bm.fields) actually
    // declares, rather than assuming heading/lead always exist. Editing a
    // field that doesn't apply to a type would silently do nothing on the
    // real site, which is worse than just not offering it inline. Full
    // real-CSS fidelity is a later phase (host the real renderer instead of
    // porting it) — this is enough to orient an editor, not a final look.
    const bm = metaOf(c);
    if (bm?.tpl) {
      const has = (k: string) => (bm.fields || []).some((f) => f.k === k);
      const titleKey = has("heading") ? "heading" : has("title") ? "title" : null;
      const bodyKey = has("lead") ? "lead" : has("body") ? "body" : null;
      // A source-bound block's stored `items` is whatever was last written
      // to WordPress (typically stale seed placeholders — resolveSources()
      // recomputes the real list at PUBLIC-SITE render time, a step this
      // Builder never runs). Showing that count would misrepresent it as
      // live; show the same "content pulled at render time" notice
      // gov-portal's own LIVE_DATA_COMPS blocks already use instead.
      const items = bm.items && !b.source ? ((b[bm.items.key] as any[]) || []) : null;
      return (
        <div className="vbk-hero">
          {titleKey
            ? <InlineText as="h2" value={b[titleKey] || ""} onChange={(v) => setField(i, titleKey, v)} placeholder={t(bm.key)} />
            : <b>{t(bm.key)}</b>}
          {bodyKey && <InlineText as="p" value={b[bodyKey] || ""} onChange={(v) => setField(i, bodyKey, v)} placeholder="…" />}
          {items && <span className="muted" style={{ display: "block", marginTop: 4 }}>{items.length} {bm.items!.key}</span>}
          {b.source && <span className="muted" style={{ display: "block", marginTop: 4 }}>{t("vb.livedata")}</span>}
        </div>
      );
    }
    return <div className="vbk-rich"><span className="muted">{c}</span></div>;
  }

  // The block palette a tenant actually sees — gov-portal's bundled TYPES
  // (tpl undefined) for a Strapi/gov-portal session, ORST_TYPES/
  // ROYALSOCIETY_TYPES (tpl==="orst"/"royalsociety") for a WordPress tenant
  // on that template. Every entry not matching the active template is
  // filtered out at this one point, so the three render sites below (the
  // insert-between popup, the search results, and the categorized grid)
  // never need their own template check.
  const paletteTypes = ALL_TYPES.filter((ty: any) => !ty.noPalette && ((ty.tpl || "gov-portal") === template || (ty.generic && (template === "orst" || template === "royalsociety"))));

  function ins(index: number) {
    return (
      <div className={"vbk-ins" + (dropAt === index ? " over" : "")} onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { if (dragNew || dragBlock >= 0) { e.preventDefault(); setDropAt(index); } }}
        onDragLeave={() => setDropAt((d) => (d === index ? -1 : d))}
        onDrop={(e) => { e.preventDefault(); handleDrop(index); }}>
        <button className="vbk-ins-btn" aria-label={t("a11y.insert")} title={t("a11y.insert")} onClick={() => setInsAt(insAt === index ? -1 : index)}><Icon name="plus" /></button>
        {/* Same Toolbox component as the rail, in compact mode — this used
            to be a flat, unsearchable list of every type, which stopped
            being usable once the palette passed ~20 entries. */}
        {insAt === index && (
          <div className="vbk-ins-pop">
            <Toolbox compact t={t} dialect={template}
              types={paletteTypes as any} categories={BLOCK_CATEGORIES} customTypes={customTypes} templates={templates}
              onAdd={(comp) => addAt(index, comp)}
              onAddCustom={(ct) => { addCustomAt(index, ct); setInsAt(-1); }}
              onApplyTemplate={(tpl) => addTemplateAt(index, tpl)}
              onDragNew={setDragNew} onDragEnd={() => { setDragNew(null); setDropAt(-1); }} />
          </div>
        )}
      </div>
    );
  }

  const compName = (comp: string) => { const m = metaOf(comp); return m ? t(m.key) : comp.replace("block.", ""); };
  const aMeta = active >= 0 ? metaOf(blocks[active]?.__component) : null;

  return (
    <>
      {/* One copy of the icon sprite for THIS (parent) document — IconPicker
          renders <use href="#i-xxx">, which only resolves symbols defined
          in the same document; RealPreview's own copy (inside its iframe)
          is a separate document and doesn't help here. */}
      <IconSpriteDefs />
      {/* Modals below stay OUTSIDE this wrapper so they keep positioning
          against the viewport rather than a fixed ancestor. */}
      <div className={fullscreen ? "vb-full" : undefined}>
      <div className="vh">
        <div><h1>{t("nav.builder")}</h1>{!fullscreen && <p>{t("vb.sub")}</p>}</div>
        <div className="vh-act">
          {/* Which page-shaped content type this canvas edits. Hidden for a
              WordPress session, where wp:page is the only reachable one. */}
          {!isWpPage && (
            <div className="seg" title={t("vb.surface")}>
              <button className={!isLanding ? "on" : ""} onClick={() => switchSurface(PAGE_UID)}>{t("vb.surfacePages")}</button>
              <button className={isLanding ? "on" : ""} onClick={() => switchSurface(LANDING_UID)}>{t("vb.surfaceLandings")}</button>
            </div>
          )}
          {pages.length > 0 && (
            <select className="vb-sel" value={sel?.docId || ""} onChange={(e) => {
              const p = pages.find((x) => x.docId === e.target.value);
              if (p && confirmDiscardIfDirty()) open(p);
            }} title={t("vb.pages")}>
              {pages.map((p) => <option key={p.docId} value={p.docId}>{p.title}</option>)}
            </select>
          )}
          {/* Same toggle for both engines; switchLocale()/open() pick the
              right mechanism (a real second Strapi entry vs. a sibling
              blocks_en field on the same WordPress entry) — see their own
              comments. Hidden with no page open; there's nothing to switch. */}
          {sel && (
            <div className="seg" title={t("vb.locale")}>
              <button className={sel.locale !== "en" ? "on" : ""} onClick={() => switchLocale("th")}>TH</button>
              <button className={sel.locale === "en" ? "on" : ""} onClick={() => switchLocale("en")}>EN</button>
            </div>
          )}
          {/* WordPress page slugs are globally unique and public-site looks
              them up as "<tenant>-<slug>"; app/orst/[page]/page.tsx's
              generateStaticParams also enumerates a fixed page list — a
              Builder-created wp:page today would be an orphan with no
              route. Creation unlocks once that route enumerates WordPress
              pages too (see the plan's later phases). */}
          {!isWpPage && <button className="btn btn--g" onClick={() => confirmDiscardIfDirty() && createPage()} disabled={saving} title={t("vb.newpage")}><Icon name="plus" />{t("vb.newpage")}</button>}
          {/* Icon-only, grouped like the device/undo toggles next to it —
              this row already carries 10 controls, and a labelled button
              here pushed Publish off the right edge. */}
          {!previewMode && (
            <div className="seg">
              <button className={tbOpen ? "on" : ""} onClick={() => setTbOpen((o) => !o)}
                title={t("tbx.toolbox")} aria-label={t("tbx.toolbox")} aria-pressed={tbOpen}>
                <Icon name="grid" />
              </button>
            </div>
          )}
          <div className="seg">
            {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
              <button key={d} className={device === d ? "on" : ""} onClick={() => setDevice(d)} title={d}><Icon name={d} /></button>
            ))}
          </div>
          <div className="seg">
            <button onClick={undo} disabled={!undoStack.length} title={t("vb.undo") + " (Ctrl+Z)"}><Icon name="undo" /></button>
            <button onClick={redo} disabled={!redoStack.length} title={t("vb.redo") + " (Ctrl+Shift+Z)"}><Icon name="redo" /></button>
          </div>
          {isDirty && <span className="badge b-warn" title={t("vb.unsavedwarn")}><span className="dot" />{t("vb.unsaved")}</span>}
          {sel && !previewMode && <>
            {isLanding && <button className={"btn btn--g" + (abEnabled ? " ab-on" : "")} onClick={openAb} title={t("vb.ab")}><Icon name="split" />{t("vb.ab")}{abEnabled ? " ·" + (editing) : ""}</button>}
            {isLanding && <button className="btn btn--g" onClick={openSchedule} title={t("vb.schedule")}><Icon name="calendar" />{t("vb.schedule")}</button>}
            <button className="btn btn--g" onClick={loadHistory} title={t("vb.history")}><Icon name="clock" />{t("vb.history")}</button>
          </>}
          <div className="seg">
            <button className={fullscreen ? "on" : ""} onClick={() => setFullscreen((f) => !f)}
              title={fullscreen ? t("vb.exitfull") : t("vb.full")} aria-label={fullscreen ? t("vb.exitfull") : t("vb.full")} aria-pressed={fullscreen}>
              <Icon name={fullscreen ? "shrink" : "expand"} />
            </button>
          </div>
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
      <div className={"vb2" + (previewMode ? " preview" : "") + (tbOpen && !previewMode ? " tbx-open" : "")}>
        <aside className="vb-insp" ref={inspRef}>
          <div className="vb-insp-h">{t("vb.blocks")} {blocks.length > 0 && <span className="mono" style={{ color: "var(--mut)" }}>{blocks.length}</span>}</div>
          {blocks.map((b, i) => {
            const bm = metaOf(b.__component);
            const isA = i === active;
            // WordPress-dialect types (ORST/RoyalSociety/shared) get the
            // full add/remove component editor (BlockComponents.tsx) in
            // place of the generic fields + single items list below.
            const wpMeta = !!(bm?.tpl || bm?.generic);
            return (
              <div className={"vb-block" + (isA ? " sel" : "") + (dragI === i ? " drag" : "")} key={i}
                draggable onDragStart={() => setDragI(i)} onDragEnd={() => setDragI(-1)}
                onDragOver={(e) => e.preventDefault()}
                // Dropping a NEW toolbox tile here (dragNew) used to silently
                // no-op — this list's own onDrop only ever handled reordering
                // an EXISTING block (dragI), so the only working way to place
                // a block was the toolbox's click-to-append or, for the
                // gov-portal RealPreview canvas specifically, nothing at all
                // (that canvas has no insert-between affordance of its own —
                // see the vb-stage branch below). Found stress-testing DGA.
                onDrop={() => {
                  if (dragI >= 0) { reorder(dragI, i); setDragI(-1); }
                  else if (dragNew?.comp) addAt(i, dragNew.comp);
                  else if (dragNew?.custom) addCustomAt(i, dragNew.custom);
                  else if (dragNew?.template) addTemplateAt(i, dragNew.template);
                  setDragNew(null); setDropAt(-1);
                }}>
                <div className="vb-block-h" onClick={() => setActive(isA ? -1 : i)}>
                  <span className="vb-grip"><Icon name="drag" /></span>
                  <Icon name={iconOf(b)} />
                  <b>{labelOf(b)}</b>
                  <div className="vb-block-a" onClick={(e) => e.stopPropagation()}>
                    <button aria-label={t("a11y.moveup")} title={t("a11y.moveup")} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button aria-label={t("a11y.movedown")} title={t("a11y.movedown")} onClick={() => move(i, 1)} disabled={i === blocks.length - 1}>↓</button>
                    <button aria-label={t("a11y.duplicate")} title={t("a11y.duplicate")} onClick={() => dup(i)}>⧉</button>
                    <button aria-label={t("vb.addbelow")} title={t("vb.addbelow")} className={sideInsAt === i + 1 ? "on" : ""}
                      onClick={() => setSideInsAt(sideInsAt === i + 1 ? -1 : i + 1)}><Icon name="plus" /></button>
                    <button aria-label={t("a11y.delete")} title={t("a11y.delete")} className="rm" onClick={() => remove(i)}><Icon name="trash" /></button>
                  </div>
                </div>
                {isA && (
                  <div className="vb-block-b">
                    {b.__component === "block.embed" && (
                      <div className="notice" style={{ marginBottom: 9 }}><Icon name="shield" />{t("vb.embedwarn")}</div>
                    )}
                    {b.__component === "block.form" && (
                      <div className="notice" style={{ marginBottom: 9 }}><Icon name="shield" />{t("vb.formwarn")}</div>
                    )}
                    {!wpMeta && (bm?.fields || []).filter((f: any) => !f.when || f.when(b)).map((f: any) => (
                      <div className="fld" key={f.k} style={{ marginBottom: 9 }}>
                        <label style={{ fontSize: 11 }}>{f.k}</label>
                        {f.rich
                          ? <RichText value={b[f.k] || ""} onChange={(h) => setField(i, f.k, h)} />
                          : f.code
                            ? <textarea value={b[f.k] || ""} onChange={(e) => setField(i, f.k, e.target.value)} style={{ minHeight: 140, fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12.5 }} spellCheck={false} />
                            : f.select
                              ? <select value={b[f.k] || ""} onChange={(e) => setField(i, f.k, e.target.value)}>
                                  {f.select.map((opt: string) => <option key={opt} value={opt}>{opt || "—"}</option>)}
                                </select>
                              : f.ta
                                ? <textarea value={b[f.k] || ""} onChange={(e) => setField(i, f.k, e.target.value)} style={{ minHeight: 54 }} />
                                : <input value={b[f.k] || ""} onChange={(e) => setField(i, f.k, e.target.value)} />}
                      </div>
                    ))}
                    {/* Live-data source binding — the ORST answer to
                        gov-portal's block.collection-list content-type
                        picker. Only meaningful on the plain "items" list
                        (not "paragraphs"/"actions", which are always
                        admin-authored) — see public-site/lib/blockSource.ts
                        for what each postType/map combination actually
                        does; this UI doesn't validate the combination makes
                        sense, matching the same escape-hatch tradeoff
                        block.custom's freeform props already accept. When
                        bound, resolveSources() OVERWRITES `items` on every
                        render, so the generic items editor below is hidden
                        — hand-editing items on a source-bound block would
                        silently vanish on the next publish, which is worse
                        than not offering the control at all. */}
                    {wpMeta && <BlockComponents block={b} meta={bm!} template={template} customIcons={customIcons}
                      device={device} selectedComp={activeComp}
                      onPickComp={(k) => setSelComp(k ? { i, key: k } : null)}
                      onResetBox={(k) => setBox(i, k, device, null)}
                      onResetAllBoxes={() => updateBlockField(i, ["boxes", device], undefined)}
                      update={(p, v) => updateBlockField(i, p, v)} arrayAdd={(p, it) => onArrayAdd(i, p, it)} arrayRemove={(p, k) => onArrayRemove(i, p, k)}
                      hidePrimary={bm!.items?.key === "items" && !!b.source}
                      sourceSlot={bm?.tpl && bm.items?.key === "items" && (!bm.items.when || bm.items.when(b)) && (
                      <div className="fld" style={{ marginBottom: 9 }}>
                        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                          <input type="checkbox" checked={!!b.source} onChange={(e) => setField(i, "source", e.target.checked ? { kind: "wp", postType: "service", map: "card" } : undefined)} />
                          {t("vb.orst.source")}
                        </label>
                        {b.source && (
                          <div style={{ display: "grid", gap: 6, marginTop: 6, background: "var(--sunk)", borderRadius: 9, padding: 8 }}>
                            <select value={b.source.postType || "service"} onChange={(e) => updateBlockField(i, ["source", "postType"], e.target.value)}>
                              {["service", "publication", "news", "faq", "resource", "mission", "org-unit", "document", "timeline"].map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                            <select value={b.source.map || "card"} onChange={(e) => updateBlockField(i, ["source", "map"], e.target.value)}>
                              {["card", "link", "faq", "mission", "orgunit", "document", "timeline", "dated"].map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                            <input placeholder="icon (i-file, i-video, …)" value={b.source.icon || ""} onChange={(e) => updateBlockField(i, ["source", "icon"], e.target.value)} />
                            <input placeholder="tag override" value={b.source.tag || ""} onChange={(e) => updateBlockField(i, ["source", "tag"], e.target.value)} />
                            <div style={{ display: "flex", gap: 6 }}>
                              <input style={{ flex: 1 }} placeholder="limit" value={b.source.limit ?? ""} onChange={(e) => updateBlockField(i, ["source", "limit"], e.target.value ? Number(e.target.value) : undefined)} />
                              <input style={{ flex: 1 }} placeholder="offset" value={b.source.offset ?? ""} onChange={(e) => updateBlockField(i, ["source", "offset"], e.target.value ? Number(e.target.value) : undefined)} />
                            </div>
                          </div>
                        )}
                      </div>
                    )} />}
                    {/* Generic repeatable-list editor — one `items` descriptor per
                        block type (see ORST_TYPES above) drives add/edit/remove
                        for whichever array that type actually has, through the
                        same updateBlockField/onArrayAdd/onArrayRemove primitives
                        every bespoke items editor further down already uses, so
                        undo/redo and dirty-tracking work identically. Object
                        items (bm.items.fields set) render one input per field;
                        scalar items (bm.items.scalar, e.g. rich-text's
                        `paragraphs: string[]`) render a single input per entry,
                        mirroring block.featured-promo's checklist just below.
                        Hidden when the block is source-bound (see above), or
                        when the type's own `items.when(b)` says this block's
                        current field values don't use `items` at all (e.g.
                        FlexPanel's "banner" layout). */}
                    {!wpMeta && bm?.items && (!bm.items.when || bm.items.when(b)) && !(bm.items.key === "items" && b.source) && (
                      <div className="fld" style={{ marginBottom: 9 }}>
                        <label style={{ fontSize: 11 }}>{bm.items.key}</label>
                        {((b[bm.items.key] as any[]) || []).map((it: any, k: number) => (
                          <div key={k} style={{ display: "flex", gap: 6, alignItems: bm.items!.scalar ? "center" : "flex-start", marginBottom: 6, background: "var(--sunk)", borderRadius: 9, padding: 7 }}>
                            {bm.items!.scalar ? (
                              <input style={{ flex: 1 }} value={it || ""} onChange={(e) => updateBlockField(i, [bm.items!.key, k], e.target.value)} />
                            ) : (
                              <div style={{ flex: 1, display: "grid", gap: 6 }}>
                                {(bm.items!.fields || []).map((f: any) => f.icon ? (
                                  // Same full "i-xxx" id convention block.feature-grid's own
                                  // IconPicker already uses (see its own comment) — every WP-
                                  // dialect (ORST/RoyalSociety) type with an icon item field
                                  // stores it the same way, so the same built-in set applies.
                                  <IconPicker key={f.k} value={it?.[f.k] || "i-check"} builtIn={FEATURE_ICONS} customIcons={customIcons} title="icon"
                                    onChange={(v) => updateBlockField(i, [bm.items!.key, k, f.k], v)} />
                                ) : f.select ? (
                                  <select key={f.k} value={it?.[f.k] || ""} onChange={(e) => updateBlockField(i, [bm.items!.key, k, f.k], e.target.value)}>
                                    {f.select.map((opt: string) => <option key={opt} value={opt}>{f.k + (opt ? ": " + opt : "")}</option>)}
                                  </select>
                                ) : (
                                  f.ta
                                    ? <textarea key={f.k} placeholder={f.k} value={it?.[f.k] || ""} onChange={(e) => updateBlockField(i, [bm.items!.key, k, f.k], e.target.value)} style={{ minHeight: 44 }} />
                                    : <input key={f.k} placeholder={f.k} value={it?.[f.k] || ""} onChange={(e) => updateBlockField(i, [bm.items!.key, k, f.k], e.target.value)} />
                                ))}
                              </div>
                            )}
                            <button className="ic-btn" aria-label={t("a11y.delete")} onClick={() => onArrayRemove(i, [bm.items!.key], k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" onClick={() => onArrayAdd(i, [bm.items!.key], JSON.parse(JSON.stringify(bm.items!.def)))}><Icon name="plus" />{bm.items.key}</button>
                      </div>
                    )}
                    {(b.__component === "block.image" || b.__component === "block.hero" || b.__component === "block.featured-promo") && (
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
                            <IconPicker value={it.icon || "i-check"} builtIn={FEATURE_ICONS} customIcons={customIcons} title="icon"
                              onChange={(v) => setItem(i, k, "icon", v)} />
                            <input value={it.title || ""} placeholder="title" onChange={(e) => setItem(i, k, "title", e.target.value)} />
                            <input value={it.text || ""} placeholder="text" onChange={(e) => setItem(i, k, "text", e.target.value)} />
                            <input value={it.url || ""} placeholder="url" onChange={(e) => setItem(i, k, "url", e.target.value)} />
                            <select value={it.colorTheme || "blue"} onChange={(e) => setItem(i, k, "colorTheme", e.target.value)} title="color">
                              {FEATURE_THEMES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmItem(i, k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addItem(i)}><Icon name="plus" />item</button>
                      </div>
                    )}
                    {b.__component === "block.stat-row" && (
                      <div className="vb-items">
                        <label style={{ fontSize: 11 }}>items</label>
                        {(b.items || []).map((it: any, k: number) => (
                          <div className="vb-item" key={k}>
                            {/* stat-row items store the SHORT unprefixed form
                                ("clock", not "i-clock" — see blocks.tsx's own
                                AnyIcon comment, which prefixes only at render
                                time) — IconPicker wants real symbol ids to
                                look them up in the sprite, so the "i-" prefix
                                is added going in and stripped coming back out,
                                right here, without touching what's stored. */}
                            <IconPicker value={"i-" + (it.icon || "users")} builtIn={STAT_ICONS.map((ic) => "i-" + ic)} customIcons={customIcons} title="icon"
                              // Only unprefix a value that's actually one of
                              // the built-ins passed in above — a custom
                              // icon's own key (which IconPicker returns
                              // as-is) is stored raw either way, even on the
                              // unlikely chance it happens to start with "i-".
                              onChange={(v) => setStatItem(i, k, "icon", v.startsWith("i-") && STAT_ICONS.includes(v.slice(2)) ? v.slice(2) : v)} />
                            <input value={it.value || ""} placeholder="value" onChange={(e) => setStatItem(i, k, "value", e.target.value)} />
                            <input value={it.label || ""} placeholder="label" onChange={(e) => setStatItem(i, k, "label", e.target.value)} />
                            <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmStatItem(i, k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addStatItem(i)}><Icon name="plus" />item</button>
                      </div>
                    )}
                    {b.__component === "block.featured-promo" && (
                      <div className="vb-items">
                        <label style={{ fontSize: 11 }}>checklist</label>
                        {(b.items || []).map((li: string, k: number) => (
                          <div className="vb-item" key={k}>
                            <input value={li || ""} placeholder="checklist item" onChange={(e) => setChecklistItem(i, k, e.target.value)} />
                            <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmChecklistItem(i, k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addChecklistItem(i)}><Icon name="plus" />item</button>
                      </div>
                    )}
                    {b.__component === "block.testimonials" && (
                      <div className="vb-items">
                        <label style={{ fontSize: 11 }}>items</label>
                        {(b.items || []).map((it: any, k: number) => (
                          <div className="vb-item" key={k} style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                            <div className="ed-media" style={{ flex: "0 0 auto" }}>
                              {it.avatar?.url ? <img className="ed-img" src={(it.avatar.url as string).startsWith("http") ? it.avatar.url : "/api/strapi" + it.avatar.url} alt="" /> : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                              <label className="btn btn--g" style={{ cursor: "pointer" }}><Icon name="img" />{uploadingI === i ? t("m.uploading") : t("m.change")}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadTestiAvatar(i, k, e.target.files[0])} /></label>
                            </div>
                            <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 5 }}>
                              <textarea value={it.quote || ""} placeholder="quote" style={{ minHeight: 50 }} onChange={(e) => setTestiItem(i, k, "quote", e.target.value)} />
                              <input value={it.author || ""} placeholder="author" onChange={(e) => setTestiItem(i, k, "author", e.target.value)} />
                              <input value={it.role || ""} placeholder="role" onChange={(e) => setTestiItem(i, k, "role", e.target.value)} />
                            </div>
                            <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmTestiItem(i, k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addTestiItem(i)}><Icon name="plus" />item</button>
                      </div>
                    )}
                    {b.__component === "block.logo-cloud" && (
                      <div className="vb-items">
                        <label style={{ fontSize: 11 }}>items</label>
                        {(b.items || []).map((it: any, k: number) => (
                          <div className="vb-item" key={k} style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                            <div className="ed-media" style={{ flex: "0 0 auto" }}>
                              {it.logo?.url ? <img className="ed-img" src={(it.logo.url as string).startsWith("http") ? it.logo.url : "/api/strapi" + it.logo.url} alt="" /> : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                              <label className="btn btn--g" style={{ cursor: "pointer" }}><Icon name="img" />{uploadingI === i ? t("m.uploading") : t("m.change")}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadLogoImg(i, k, e.target.files[0])} /></label>
                            </div>
                            <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 5 }}>
                              <input value={it.name || ""} placeholder="name" onChange={(e) => setLogoItem(i, k, "name", e.target.value)} />
                              <input value={it.url || ""} placeholder="link url (optional)" onChange={(e) => setLogoItem(i, k, "url", e.target.value)} />
                            </div>
                            <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmLogoItem(i, k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addLogoItem(i)}><Icon name="plus" />item</button>
                      </div>
                    )}
                    {b.__component === "block.team-grid" && (
                      <div className="vb-items">
                        <label style={{ fontSize: 11 }}>items</label>
                        {(b.items || []).map((it: any, k: number) => (
                          <div className="vb-item" key={k} style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                            <div className="ed-media" style={{ flex: "0 0 auto" }}>
                              {it.photo?.url ? <img className="ed-img" src={(it.photo.url as string).startsWith("http") ? it.photo.url : "/api/strapi" + it.photo.url} alt="" /> : <div className="ed-img ed-img--none">{t("m.none")}</div>}
                              <label className="btn btn--g" style={{ cursor: "pointer" }}><Icon name="img" />{uploadingI === i ? t("m.uploading") : t("m.change")}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadTeamPhoto(i, k, e.target.files[0])} /></label>
                            </div>
                            <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 5 }}>
                              <input value={it.name || ""} placeholder="name" onChange={(e) => setTeamItem(i, k, "name", e.target.value)} />
                              <input value={it.role || ""} placeholder="role" onChange={(e) => setTeamItem(i, k, "role", e.target.value)} />
                              <textarea value={it.bio || ""} placeholder="bio (optional)" style={{ minHeight: 40 }} onChange={(e) => setTeamItem(i, k, "bio", e.target.value)} />
                            </div>
                            <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmTeamItem(i, k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addTeamItem(i)}><Icon name="plus" />item</button>
                      </div>
                    )}
                    {b.__component === "block.spacer" && (
                      <>
                        <div className="fld" style={{ marginBottom: 9 }}>
                          <label style={{ fontSize: 11 }}>{t("vb.spacer.style")}</label>
                          <select value={b.style || "space"} onChange={(e) => setField(i, "style", e.target.value)}>
                            <option value="space">{t("vb.spacer.blank")}</option>
                            <option value="line">{t("vb.spacer.line")}</option>
                          </select>
                        </div>
                        <div className="fld" style={{ marginBottom: 9 }}>
                          <label style={{ fontSize: 11 }}>{t("vb.spacer.size")}</label>
                          <select value={b.size || "md"} onChange={(e) => setField(i, "size", e.target.value)}>
                            <option value="sm">{t("vb.spacer.sm")}</option>
                            <option value="md">{t("vb.spacer.md")}</option>
                            <option value="lg">{t("vb.spacer.lg")}</option>
                          </select>
                        </div>
                      </>
                    )}
                    {b.__component === "block.tabs" && (
                      <>
                        <div className="fld" style={{ marginBottom: 9 }}>
                          <label style={{ fontSize: 11 }}>{t("vb.tabs.layout")}</label>
                          <select value={b.layout || "tabs"} onChange={(e) => setField(i, "layout", e.target.value)}>
                            <option value="tabs">{t("vb.tabs.tabs")}</option>
                            <option value="accordion">{t("vb.tabs.accordion")}</option>
                          </select>
                        </div>
                        <div className="vb-items">
                          <label style={{ fontSize: 11 }}>{t("vb.tabs.items")}</label>
                          {(b.items || []).map((it: any, k: number) => (
                            <div key={k} style={{ border: "1px solid var(--line2)", borderRadius: 9, padding: 8, marginBottom: 7 }}>
                              <div style={{ display: "flex", gap: 5, marginBottom: 6, alignItems: "center" }}>
                                <input value={it.title || ""} placeholder="title" style={{ flex: 1 }} onChange={(e) => setTabItem(i, k, "title", e.target.value)} />
                                <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmTabItem(i, k)}><Icon name="trash" /></button>
                              </div>
                              <RichText value={it.body || ""} onChange={(h) => setTabItem(i, k, "body", h)} />
                            </div>
                          ))}
                          <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addTabItem(i)}><Icon name="plus" />item</button>
                        </div>
                      </>
                    )}
                    {b.__component === "block.comparison" && (
                      <div className="vb-items">
                        <label style={{ fontSize: 11 }}>{t("vb.cmp.columns")}</label>
                        {(b.columns || []).map((c: any, k: number) => (
                          <div key={k} style={{ border: "1px solid var(--line2)", borderRadius: 9, padding: 8, marginBottom: 7, display: "flex", flexDirection: "column", gap: 5 }}>
                            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                              <input value={c.name || ""} placeholder="name" style={{ flex: 1 }} onChange={(e) => setCmpCol(i, k, "name", e.target.value)} />
                              <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmCmpCol(i, k)}><Icon name="trash" /></button>
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              <input value={c.price || ""} placeholder={t("vb.cmp.price")} style={{ flex: 1 }} onChange={(e) => setCmpCol(i, k, "price", e.target.value)} />
                              <input value={c.period || ""} placeholder={t("vb.cmp.period")} style={{ flex: 1 }} onChange={(e) => setCmpCol(i, k, "period", e.target.value)} />
                            </div>
                            <textarea value={c.description || ""} placeholder="description" style={{ minHeight: 40 }} onChange={(e) => setCmpCol(i, k, "description", e.target.value)} />
                            <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                              <input type="checkbox" checked={!!c.highlight} onChange={(e) => setCmpCol(i, k, "highlight", e.target.checked)} />
                              {t("vb.cmp.highlight")}
                            </label>
                            <div>
                              <label style={{ fontSize: 10.5, color: "var(--mut)" }}>{t("vb.cmp.features")}</label>
                              {(c.features || []).map((f: string, fi: number) => (
                                <div key={fi} style={{ display: "flex", gap: 5, marginTop: 4 }}>
                                  <input value={f || ""} placeholder="feature" style={{ flex: 1 }} onChange={(e) => setCmpFeature(i, k, fi, e.target.value)} />
                                  <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => rmCmpFeature(i, k, fi)}><Icon name="trash" /></button>
                                </div>
                              ))}
                              <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={() => addCmpFeature(i, k)}><Icon name="plus" />feature</button>
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              <input value={c.ctaLabel || ""} placeholder={t("vb.cmp.ctalabel")} style={{ flex: 1 }} onChange={(e) => setCmpCol(i, k, "ctaLabel", e.target.value)} />
                              <input value={c.ctaUrl || ""} placeholder={t("vb.cmp.ctaurl")} style={{ flex: 1 }} onChange={(e) => setCmpCol(i, k, "ctaUrl", e.target.value)} />
                            </div>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => addCmpCol(i)}><Icon name="plus" />{t("vb.cmp.addcolumn")}</button>
                      </div>
                    )}
                    {/* table's `columns: string[]` + `rows: string[][]` is a
                        genuine 2D grid, not a single repeatable list, so it
                        doesn't fit the generic `items` descriptor (see
                        GENERIC_TYPES' own note on why this type has none) —
                        a bespoke editor, same convention as block.comparison
                        above. `table` is one of GENERIC_TYPES' shared
                        entries (bare, un-prefixed `__component`) since the
                        shape (and this editor UI) is identical across every
                        WP-dialect tenant — only each Blocks.tsx's CSS skin
                        differs. Rows aren't resized when a column is
                        added/removed; a row shorter than the current column
                        count just renders blank cells for the missing ones
                        (`c || ""` below), same forgiving behavior every
                        Blocks.tsx's TableBlock renders with. */}
                    {b.__component === "table" && (
                      <div className="vb-items">
                        <label style={{ fontSize: 11 }}>{t("vb.orst.table.columns")}</label>
                        {((b.columns as string[]) || []).map((c, k) => (
                          <div key={k} style={{ display: "flex", gap: 5, marginBottom: 5 }}>
                            <input style={{ flex: 1 }} value={c || ""} onChange={(e) => updateBlockField(i, ["columns", k], e.target.value)} />
                            <button className="rm" aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => onArrayRemove(i, ["columns"], k)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }} onClick={() => onArrayAdd(i, ["columns"], "")}><Icon name="plus" />{t("vb.orst.table.addcolumn")}</button>
                        <label style={{ fontSize: 11 }}>{t("vb.orst.table.rows")}</label>
                        {((b.rows as string[][]) || []).map((row, ri) => (
                          <div key={ri} style={{ border: "1px solid var(--line2)", borderRadius: 9, padding: 8, marginBottom: 7 }}>
                            {((b.columns as string[]) || [""]).map((col, ci) => (
                              <input key={ci} style={{ width: "100%", marginBottom: ci < (b.columns?.length || 1) - 1 ? 5 : 0 }} placeholder={col || "column " + (ci + 1)}
                                value={row?.[ci] || ""} onChange={(e) => updateBlockField(i, ["rows", ri, ci], e.target.value)} />
                            ))}
                            <button className="rm" style={{ marginTop: 5 }} aria-label={t("a11y.removeitem")} title={t("a11y.removeitem")} onClick={() => onArrayRemove(i, ["rows"], ri)}><Icon name="trash" /></button>
                          </div>
                        ))}
                        <button className="vb-add-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => onArrayAdd(i, ["rows"], new Array((b.columns as string[])?.length || 1).fill(""))}><Icon name="plus" />{t("vb.orst.table.addrow")}</button>
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
                    {b.__component === "block.collection-list" && (() => {
                      const ct = contentTypes.find((c) => c.uid === b.contentTypeUid);
                      const attrs = ct?.attributes;
                      const titleOpts = fieldsOfType(attrs, ["string", "uid", "text"]);
                      const imageOpts = fieldsOfType(attrs, ["media"]);
                      const excerptOpts = fieldsOfType(attrs, ["text", "richtext", "customField", "string"]);
                      const dateOpts = fieldsOfType(attrs, ["date", "datetime"]);
                      const linkOpts = fieldsOfType(attrs, ["string", "uid"]);
                      const videoUrlOpts = fieldsOfType(attrs, ["string"]);
                      const sortOpts = Array.from(new Set([...fieldsOfType(attrs, ["string", "date", "datetime", "integer"]), "createdAt", "updatedAt", "publishedAt"]));
                      return (
                        <>
                          <div className="fld" style={{ marginBottom: 9 }}>
                            <label style={{ fontSize: 11 }}>{t("vb.cl.contenttype")}</label>
                            <select value={b.contentTypeUid || ""} onChange={(e) => {
                              const next = contentTypes.find((c) => c.uid === e.target.value);
                              updateBlock(i, (bl) => ({ ...bl, contentTypeUid: next?.uid || "", pluralName: next?.pluralName || "",
                                titleField: "", imageField: "", excerptField: "", dateField: "", linkField: "", bodyField: "", linkToDetail: false,
                                layout: "grid", videoUrlField: "", sortField: "createdAt", sortDir: "desc" }));
                            }}>
                              <option value="">— {t("vb.cl.contenttype")} —</option>
                              {contentTypes.map((c) => <option key={c.uid} value={c.uid}>{c.name}</option>)}
                            </select>
                          </div>
                          {ct && (
                            <>
                              {b.contentTypeUid === "api::location.location" && (
                                <div className="fld" style={{ marginBottom: 9 }}>
                                  <label style={{ fontSize: 11 }}>{t("vb.cl.layout")}</label>
                                  <select value={b.layout || "grid"} onChange={(e) => setField(i, "layout", e.target.value)}>
                                    <option value="grid">{t("vb.cl.layout.grid")}</option>
                                    <option value="map">{t("vb.cl.layout.map")}</option>
                                  </select>
                                </div>
                              )}
                              <div className="fld" style={{ marginBottom: 9 }}>
                                <label style={{ fontSize: 11 }}>{t("vb.cl.title")}</label>
                                <select value={b.titleField || ""} onChange={(e) => setField(i, "titleField", e.target.value)}>
                                  <option value="">—</option>
                                  {titleOpts.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </div>
                              <div className="fld" style={{ marginBottom: 9 }}>
                                <label style={{ fontSize: 11 }}>{t("vb.cl.image")}</label>
                                <select value={b.imageField || ""} onChange={(e) => setField(i, "imageField", e.target.value)}>
                                  <option value="">{t("vb.cl.none")}</option>
                                  {imageOpts.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </div>
                              <div className="fld" style={{ marginBottom: 9 }}>
                                <label style={{ fontSize: 11 }}>{t("vb.cl.excerpt")}</label>
                                <select value={b.excerptField || ""} onChange={(e) => setField(i, "excerptField", e.target.value)}>
                                  <option value="">{t("vb.cl.none")}</option>
                                  {excerptOpts.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </div>
                              <div className="fld" style={{ marginBottom: 9 }}>
                                <label style={{ fontSize: 11 }}>{t("vb.cl.date")}</label>
                                <select value={b.dateField || ""} onChange={(e) => setField(i, "dateField", e.target.value)}>
                                  <option value="">{t("vb.cl.none")}</option>
                                  {dateOpts.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </div>
                              <div className="fld" style={{ marginBottom: 9 }}>
                                <label style={{ fontSize: 11 }}>{t("vb.cl.body")}</label>
                                <select value={b.bodyField || ""} onChange={(e) => setField(i, "bodyField", e.target.value)}>
                                  <option value="">{t("vb.cl.none")}</option>
                                  {excerptOpts.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </div>
                              <div className="fld" style={{ marginBottom: 9 }}>
                                <label style={{ fontSize: 11 }}>{t("vb.cl.videourl")}</label>
                                <select value={b.videoUrlField || ""} onChange={(e) => setField(i, "videoUrlField", e.target.value)}>
                                  <option value="">{t("vb.cl.none")}</option>
                                  {videoUrlOpts.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </div>
                              <div className="fld" style={{ marginBottom: 9 }}>
                                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                                  <input type="checkbox" checked={!!b.linkToDetail} onChange={(e) => setField(i, "linkToDetail", e.target.checked)} />
                                  {t("vb.cl.linktodetail")}
                                </label>
                              </div>
                              {!b.linkToDetail && (
                                <div className="fld" style={{ marginBottom: 9 }}>
                                  <label style={{ fontSize: 11 }}>{t("vb.cl.link")}</label>
                                  <select value={b.linkField || ""} onChange={(e) => setField(i, "linkField", e.target.value)}>
                                    <option value="">{t("vb.cl.none")}</option>
                                    {linkOpts.map((f) => <option key={f} value={f}>{f}</option>)}
                                  </select>
                                </div>
                              )}
                              <div className="fld" style={{ marginBottom: 9, display: "flex", gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: 11 }}>{t("vb.cl.sort")}</label>
                                  <select value={b.sortField || "createdAt"} onChange={(e) => setField(i, "sortField", e.target.value)}>
                                    {sortOpts.map((f) => <option key={f} value={f}>{f}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={{ fontSize: 11 }}>{t("vb.cl.sortdir")}</label>
                                  <select value={b.sortDir || "desc"} onChange={(e) => setField(i, "sortDir", e.target.value)}>
                                    <option value="desc">↓</option>
                                    <option value="asc">↑</option>
                                  </select>
                                </div>
                              </div>
                              <div className="fld" style={{ marginBottom: 9 }}>
                                <label style={{ fontSize: 11 }}>{t("vb.cl.pagesize")}</label>
                                <input type="number" min={1} max={100} value={b.pageSize ?? 12} onChange={(e) => setField(i, "pageSize", Number(e.target.value) || 12)} />
                              </div>
                            </>
                          )}
                        </>
                      );
                    })()}
                    {b.__component === "block.form" && (() => {
                      const typeOpts = Object.values(FORM_FIELD_DEFS);
                      const def = FORM_FIELD_DEFS[b.contentTypeUid];
                      return (
                        <>
                          <div className="fld" style={{ marginBottom: 9 }}>
                            <label style={{ fontSize: 11 }}>{t("vb.form.contenttype")}</label>
                            <select value={b.contentTypeUid || ""} onChange={(e) =>
                              updateBlock(i, (bl) => ({ ...bl, contentTypeUid: e.target.value, mode: "submit" }))
                            }>
                              <option value="">— {t("vb.form.contenttype")} —</option>
                              {typeOpts.map((d) => <option key={d.uid} value={d.uid}>{d.label}</option>)}
                            </select>
                          </div>
                          {def?.hasTracking && (
                            <div className="fld" style={{ marginBottom: 9 }}>
                              <label style={{ fontSize: 11 }}>{t("vb.form.mode")}</label>
                              <select value={b.mode || "submit"} onChange={(e) => setField(i, "mode", e.target.value)}>
                                <option value="submit">{t("vb.form.mode.submit")}</option>
                                <option value="track">{t("vb.form.mode.track")}</option>
                              </select>
                            </div>
                          )}
                          {def?.isAnonymousToggleable && (b.mode || "submit") !== "track" && (
                            <div className="notice" style={{ marginBottom: 9 }}><Icon name="shield" />{t("vb.form.anonwarn")}</div>
                          )}
                          {!def && !b.contentTypeUid && (
                            <div className="muted" style={{ fontSize: 11 }}>{t("vb.form.pick")}</div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
                {sideInsAt === i + 1 && (
                  <div className="vb-block-ins">
                    <Toolbox compact t={t} dialect={template}
                      types={paletteTypes as any} categories={BLOCK_CATEGORIES} customTypes={customTypes} templates={templates}
                      onAdd={(comp) => { addAt(i + 1, comp); setSideInsAt(-1); }}
                      onAddCustom={(ct) => { addCustomAt(i + 1, ct); setSideInsAt(-1); }}
                      onApplyTemplate={(tpl) => { addTemplateAt(i + 1, tpl); setSideInsAt(-1); }}
                      onDragNew={setDragNew} onDragEnd={() => { setDragNew(null); setDropAt(-1); }} />
                  </div>
                )}
              </div>
            );
          })}
        </aside>

        <div className="vb-stage">
          {!sel || loading ? <div className="muted" style={{ padding: 40, textAlign: "center" }}>{loading ? t("vb.loading") : t("vb.empty")}</div> : localeMissing ? (
            <div className="muted" style={{ padding: 50, textAlign: "center" }}>
              <p>{t("vb.localemissing")}</p>
              <button className="btn btn--p" onClick={() => createLocale("en")} disabled={creatingLocale}>
                <Icon name="plus" />{creatingLocale ? t("vb.creatinglocale") : t("vb.createlocale")}
              </button>
            </div>
          ) : gpSupported ? (
            previewLoading ? <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("vb.loading")}</div> :
            <div className="vb-frame" style={{ maxWidth: DEVW[device], margin: device === "desktop" ? undefined : "0 auto" }}>
              {device !== "desktop" && <div className="vb-frame-bar"><i /><i /><i /><span className="psite-url">{(tenantKey || "site") + ".go.th"}</span><span className="vb-dev-tag">{device}</span></div>}
              {/* no "|| dga" fallback — RealPreview's tenant prop is already
                  optional; substituting a DIFFERENT real tenant risked
                  rendering a wrong-agency preview for an unscoped session. */}
              <RealPreview blocks={blocks} homeData={previewHomeData} customTypes={Object.fromEntries(customTypes.map((c) => [c.key, c]))} customIcons={Object.fromEntries(customIcons.map((c) => [c.key, c]))} collectionData={collectionData} tenant={tenantKey || undefined}
                {...(previewMode ? {} : {
                  active, onSelect: setActive,
                  onFieldChange: updateBlockField,
                  onImagePick: uploadFieldImage,
                  onArrayAdd, onArrayRemove,
                  onDeselect: () => setActive(-1),
                })} />
            </div>
          ) : isWpPage && (template === "orst" || template === "royalsociety") ? (
            // Preview-harness templates (ORST and RoyalSociety — see
            // RealPreview.tsx's HARNESS_PATH) render their OWN real CSS/icon
            // set via a cross-origin iframe instead of the .vbk-* mockup.
            // Always read-only regardless of previewMode (no edit-callback
            // props passed) — see RealPreview's own comment on why inline
            // click-to-edit isn't possible across that boundary; all editing
            // for these pages happens in the sidebar.
            <div className="vb-frame" style={{ maxWidth: DEVW[device], margin: device === "desktop" ? undefined : "0 auto" }}>
              {device !== "desktop" && <div className="vb-frame-bar"><i /><i /><i /><span className="psite-url">{(tenantKey || "site") + ".go.th"}</span><span className="vb-dev-tag">{device}</span></div>}
              {/* The harness renders via the template's OWN Blocks.tsx,
                  which reads `type` — the wire dialect, not the Builder's
                  internal `__component` one blocks is stored in here. Same
                  toWire() translation pageBody() applies before saving; see
                  blockDialect.ts. */}
              <RealPreview blocks={wireBlocks} tenant={tenantKey || template} harness={template}
                labels={blockLabels} active={active} onSelect={setActive}
                device={device} comp={activeComp} onComponent={onComponent} onBox={setBox} onNavigate={navigateTo} />
            </div>
          ) : previewMode ? (
            <div className="muted" style={{ padding: 40, textAlign: "center" }}>{t("vb.previewunsupported")}</div>
          ) : (
            <div className="vb-frame">
              <div className="vb-frame-bar"><i /><i /><i /><span className="psite-url">{(tenantKey || "site") + ".go.th/" + (sel.title || "").slice(0, 14)}</span><span className="vb-dev-tag">{device}</span></div>
              <div className={"vb-canvas" + (dragNew || dragBlock >= 0 ? " dragging" : "")} style={{ maxWidth: DEVW[device] }}>
                <div className="vbk-nav"><b>{current?.name || "WebX"}</b><span>Home</span><span>Services</span><span>News</span></div>
                {blocks.length === 0 && <div className="muted" style={{ padding: 50, textAlign: "center" }}>{t("vb.noblocks")}</div>}
                {blocks.map((b, i) => (
                  <div key={i}>
                    {ins(i)}
                    <div className={"vbk-wrap" + (i === active ? " sel" : "") + (i === dragBlock ? " ghost" : "") + ((b as any).__agent ? " ag-draft" : "")} onClick={() => setActive(i)}>
                      {(b as any).__agent && <span className="ag-draft-tag">{t("vb.agentdraft")}</span>}
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
        {/* Toolbox rail. Rendered last in the DOM but ordered first
            visually (see globals.css's .vb2 order rules) so the inspector
            keeps its original keyboard/screen-reader position. */}
        {tbOpen && !previewMode && (
          <aside className="vb-tbpane">
            <Toolbox t={t} dialect={template}
              types={paletteTypes as any} categories={BLOCK_CATEGORIES}
              customTypes={customTypes} templates={templates}
              onAdd={add} onAddCustom={addCustom} onApplyTemplate={applyTemplate}
              onDragNew={setDragNew} onDragEnd={() => { setDragNew(null); setDropAt(-1); }}
              onSaveTemplate={() => (blocks.length ? setTplForm({ name: sel?.title || "", description: "" }) : setMsg({ t: t("tbx.tplempty"), ok: false }))}
              onManageTemplates={() => setTplManage(true)}
              // Both manage raw Strapi content types (block-type/icon) — no
              // WordPress equivalent, and the underlying fetches 401 under a
              // WordPress session, so they stay hidden there (unchanged from
              // when these buttons lived at the bottom of the inspector).
              onManageTypes={isWpPage ? undefined : () => setShowTypeEditor(true)}
              onManageIcons={isWpPage ? undefined : () => setShowIconManager(true)}
              canManage
              ai={{ prompt: aiPrompt, busy: false, setPrompt: setAiPrompt, run: askAgent }} />
          </aside>
        )}
      </div>
      </div>

      {showTypeEditor && <BlockTypeEditor tenantKey={tenantKey} onClose={() => setShowTypeEditor(false)} onSaved={loadTypes} />}
      {showIconManager && <IconManager tenantKey={tenantKey} onClose={() => setShowIconManager(false)} onSaved={loadIcons} />}

      {/* Save the current canvas as a reusable template */}
      {tplForm && (
        <>
          <div className="scrim" onClick={() => setTplForm(null)} />
          <div className="vb-sched" role="dialog" aria-modal="true" aria-label={t("tbx.savetpl")}>
            <div className="ovhead"><h3 style={{ flex: 1 }}>{t("tbx.savetpl")}</h3><button className="ic-btn" onClick={() => setTplForm(null)} aria-label={t("a11y.close")}><Icon name="close" /></button></div>
            <p className="muted" style={{ fontSize: 12.5, margin: "0 0 14px" }}>{t("tbx.tplsavehint")}</p>
            <label className="vb-fld"><span>{t("tbx.tplname")}</span>
              <input value={tplForm.name} autoFocus onChange={(e) => setTplForm((f) => ({ ...f!, name: e.target.value }))} placeholder={t("tbx.tplname")} />
            </label>
            <label className="vb-fld"><span>{t("tbx.tpldesc")}</span>
              <input value={tplForm.description} onChange={(e) => setTplForm((f) => ({ ...f!, description: e.target.value }))} />
            </label>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
              {blocks.length} {t("tbx.blockcount")} · {t("tbx.tpldialect")}: <span className="mono">{template}</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
              <button className="btn btn--p" onClick={saveTemplate} disabled={saving || !tplForm.name.trim()}>{t("tbx.savetpl")}</button>
              <button className="btn btn--g" onClick={() => setTplForm(null)}>{t("e.cancel")}</button>
            </div>
          </div>
        </>
      )}

      {/* Manage saved templates — rename is deliberately out of scope (a
          template is cheap to re-save); this covers the two actions that
          can't be done any other way: removing one, and promoting one to
          every workspace. */}
      {tplManage && (
        <>
          <div className="scrim" onClick={() => setTplManage(false)} />
          <div className="vb-sched" role="dialog" aria-modal="true" aria-label={t("tbx.managetpl")}>
            <div className="ovhead"><h3 style={{ flex: 1 }}>{t("tbx.managetpl")}</h3><button className="ic-btn" onClick={() => setTplManage(false)} aria-label={t("a11y.close")}><Icon name="close" /></button></div>
            {templates.length === 0 && <div className="muted" style={{ fontSize: 12.5, padding: "8px 0" }}>{t("tbx.notemplates")}</div>}
            {templates.map((tpl) => (
              <div className="vb-ver" key={tpl.docId || tpl.key}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{tpl.name}</b>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {(tpl.blocks || []).length} {t("tbx.blockcount")} · <span className="mono">{tpl.dialect}</span> · {tpl.tenantKey ? t("tbx.tplmine") : t("tbx.tplglobal")}
                  </div>
                </div>
                {/* Promoting to global clears tenantKey — but governance.ts's
                    tenantStamp re-stamps a workspace-scoped caller's own key
                    on every write, so this can only take effect for an
                    unscoped (all-workspaces) session. Offer it only there
                    rather than showing a button that silently no-ops. */}
                {!tenantKey && tpl.tenantKey && <button className="vb-cmp" onClick={() => shareTemplate(tpl)}>{t("tbx.tplshare")}</button>}
                <button className="btn btn--g" onClick={() => deleteTemplate(tpl)}><Icon name="trash" />{t("tbx.delete")}</button>
              </div>
            ))}
          </div>
        </>
      )}

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
