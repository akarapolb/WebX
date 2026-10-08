"use client";
// Header nav items — reuses the pre-existing api::menu-item.menu-item
// content type (built for the legacy static site's mega-menu, already
// tenant-scoped in governance.ts's SCOPED set). A row with `column` set is
// a legacy flyout item (untouched); a row with `column` blank is a flat
// top-nav item, which is what this screen manages. Auto-publishes on every
// mutation (create/edit/delete/reorder) — matches Branding.tsx's "changes
// are live" model; a manual publish click after every drag would make
// reordering unusable.
//
// Each flat item can optionally carry a `megaMenu` dropdown (icon/eyebrow/
// title/description/featured link + grouped sub-links) — the `megaMenu`
// JSON field on menu-item, rendered by public-site/templates/orst/Header.tsx
// AND templates/royalsociety/Header.tsx (every other template ignores the
// field and shows a plain link). This was previously hardcoded in ORST's
// own source — see strapi-cms/seed-orst-nav.mjs for the one-off migration
// of ORST's original mega-menu content into this editor.
//
// A link's `children` field (optional, recursive) is unlimited-depth menu
// support — since `megaMenu` is a plain Strapi `json` field (not a rigidly-
// typed Component; confirmed in strapi-cms/src/api/menu-item/content-types/
// menu-item/schema.json), this needed no Strapi schema change at all, only
// this editor and the two renderers understanding the extra field. A link
// with no `children` (or an empty array) renders exactly as before.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import IconPicker from "./IconPicker";
import IconSpriteDefs from "./blockPreview/IconSpriteDefs";
import type { CustomIcon } from "./IconManager";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";

const UID = "api::menu-item.menu-item";

type MegaLink = { text: string; url: string; desc: string; children?: MegaLink[] };
// A group is a box of its own in the dropdown. `heading` is its title; the
// rest mirrors the dropdown's featured box (icon / eyebrow / description /
// featured link) and is optional, so groups saved before these existed — just
// a heading and links — render exactly as they did.
type MegaGroup = { heading: string; links: MegaLink[]; icon?: string; eyebrow?: string; description?: string; featuredLabel?: string; featuredUrl?: string };
// A stack navigator always opens and closes by click (toggle), so the editor has no
// "opens on" choice. `trigger` is still stored (always "click") because older
// items were saved with "hover" and the public site ignores it either way.
type MegaTrigger = "click";
type MegaMenu = { icon: string; eyebrow: string; title: string; description: string; featuredLabel: string; featuredUrl: string; groups: MegaGroup[]; trigger: MegaTrigger };
// What an item is: a plain link, or a dropdown that opens on hover (also on
// keyboard focus) or toggles on click. Derived from megaMenu, stored inside it.
type NavKind = "normal" | "stack";
type NavItem = { docId: string; label: string; labelEn: string; url: string; openNewTab: boolean; order: number; megaMenu: MegaMenu | null };

const EMPTY_MEGA: MegaMenu = { icon: "", eyebrow: "", title: "", description: "", featuredLabel: "", featuredUrl: "", groups: [], trigger: "click" };
const EMPTY_GROUP: MegaGroup = { heading: "", links: [] };
const EMPTY_LINK: MegaLink = { text: "", url: "", desc: "" };

function normalizeLink(l: any): MegaLink {
  return {
    text: l?.text || "", url: l?.url || "", desc: l?.desc || "",
    children: Array.isArray(l?.children) && l.children.length ? l.children.map(normalizeLink) : undefined,
  };
}
function normalizeMega(raw: any): MegaMenu | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    icon: raw.icon || "", eyebrow: raw.eyebrow || "", title: raw.title || "", description: raw.description || "",
    featuredLabel: raw.featuredLabel || "", featuredUrl: raw.featuredUrl || "",
    trigger: "click",
    groups: Array.isArray(raw.groups)
      ? raw.groups.map((g: any) => ({
          heading: g?.heading || "",
          icon: g?.icon || undefined, eyebrow: g?.eyebrow || undefined, description: g?.description || undefined,
          featuredLabel: g?.featuredLabel || undefined, featuredUrl: g?.featuredUrl || undefined,
          links: Array.isArray(g?.links) ? g.links.map(normalizeLink) : [],
        }))
      : [],
  };
}

// Path-based tree helpers for a group's `links` — path is a sequence of
// child indices to descend (e.g. [2] = the 3rd top-level link, [2,0] = its
// 1st child, [2,0,1] = that child's 2nd child), so one recursive component
// (LinkEditor below) can add/edit/remove a link at any depth without a
// hardcoded number of nesting levels.
function updateLinkAt(links: MegaLink[], path: number[], patch: Partial<MegaLink>): MegaLink[] {
  const [i, ...rest] = path;
  return links.map((l, idx) => {
    if (idx !== i) return l;
    if (rest.length === 0) return { ...l, ...patch };
    return { ...l, children: updateLinkAt(l.children || [], rest, patch) };
  });
}
function removeLinkAt(links: MegaLink[], path: number[]): MegaLink[] {
  const [i, ...rest] = path;
  if (rest.length === 0) return links.filter((_, idx) => idx !== i);
  return links.map((l, idx) => (idx === i ? { ...l, children: removeLinkAt(l.children || [], rest) } : l));
}
// `path` here points at the PARENT link to add a child under (empty path =
// add a new top-level link to the group itself).
function addLinkAt(links: MegaLink[], path: number[]): MegaLink[] {
  if (path.length === 0) return [...links, { ...EMPTY_LINK }];
  const [i, ...rest] = path;
  return links.map((l, idx) => {
    if (idx !== i) return l;
    if (rest.length === 0) return { ...l, children: [...(l.children || []), { ...EMPTY_LINK }] };
    return { ...l, children: addLinkAt(l.children || [], rest) };
  });
}

// minWidth:0 overrides the browser's default flex-item auto-minimum,
// which otherwise refuses to shrink an <input> below its intrinsic
// content width — without it, 3 flex:1 fields in one narrow row (found
// live at 375px) just balloon the row to ~840px instead of sharing it.
// Built-in glyphs offered first in the picker: the ones that exist both in the
// picker's own sprite (so they can be drawn here) and in the ORST public sprite
// (so they show on the site). Anything else comes from the Material set, which
// is saved as one of the workspace's own icons and works on both.
const NAV_ICONS = ["i-book", "i-shield", "i-user", "i-grid", "i-list", "i-check", "i-clock", "i-eye"];

// The same picker the Visual Builder uses (built-in + the workspace's saved
// icons + Material), with a clear button because an empty icon is allowed here.
function NavIconField({ value, onChange, customIcons, onLibraryChanged, t }: {
  value: string; onChange: (v: string) => void; customIcons: CustomIcon[]; onLibraryChanged: () => void | Promise<void>; t: (k: string) => string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <IconPicker value={value} builtIn={NAV_ICONS} customIcons={customIcons} onLibraryChanged={onLibraryChanged} title={t("nv.mega.icon")} onChange={onChange} />
      <span className="muted" style={{ fontSize: 12.5 }}>{value || t("nv.mega.noicon")}</span>
      {value && (
        <button type="button" className="ic-btn" title={t("nv.mega.clearicon")} onClick={() => onChange("")}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

const fieldStyle = { flex: 1, minWidth: 0, background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 9, padding: "9px 11px", fontSize: 13, color: "var(--ink)" } as const;

// Recursively renders one link plus its own children (unlimited depth) —
// `path` is this link's position within its group's links tree (see the
// updateLinkAt/removeLinkAt/addLinkAt helpers above), passed straight
// through to the callbacks so they can locate this exact node regardless
// of how deep it is nested.
function LinkEditor({
  link, path, depth, t, onChangeLocal, onCommit, onRemove, onAddChild,
}: {
  link: MegaLink;
  path: number[];
  depth: number;
  t: (k: string) => string;
  onChangeLocal: (path: number[], patch: Partial<MegaLink>) => void;
  onCommit: () => void;
  onRemove: (path: number[]) => void;
  onAddChild: (path: number[]) => void;
}) {
  return (
    <div style={{ paddingLeft: 12 + 16 * depth }}>
      <div className="nav-item-row" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
        <input style={{ ...fieldStyle, flex: 1 }} placeholder={t("nv.mega.linktext")}
          value={link.text} onChange={(e) => onChangeLocal(path, { text: e.target.value })} onBlur={onCommit} />
        <input style={{ ...fieldStyle, flex: 1 }} placeholder={t("nv.mega.linkurl")}
          value={link.url} onChange={(e) => onChangeLocal(path, { url: e.target.value })} onBlur={onCommit} />
        <input style={{ ...fieldStyle, flex: 1 }} placeholder={t("nv.mega.linkdesc")}
          value={link.desc} onChange={(e) => onChangeLocal(path, { desc: e.target.value })} onBlur={onCommit} />
        <button className="ic-btn" title={t("nv.mega.addchild")} onClick={() => onAddChild(path)}>
          <Icon name="plus" />
        </button>
        <button className="ic-btn" style={{ color: "var(--bad)" }} title={t("nv.mega.removelink")} onClick={() => onRemove(path)}>
          <Icon name="close" />
        </button>
      </div>
      {(link.children || []).map((child, ci) => (
        <LinkEditor key={ci} link={child} path={[...path, ci]} depth={depth + 1} t={t}
          onChangeLocal={onChangeLocal} onCommit={onCommit} onRemove={onRemove} onAddChild={onAddChild} />
      ))}
    </div>
  );
}

export default function NavManager({ tenantKey }: { tenantKey?: string }) {
  const { t } = useLang();
  const [items, setItems] = useState<NavItem[]>([]);
  const [dragI, setDragI] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  // The workspace's saved icons (what the Visual Builder's picker lists).
  const loadIcons = useCallback(async () => {
    try {
      const { data } = await cms.entries.list<any>("api::icon.icon", { pageSize: 100, sort: "updatedAt:DESC" });
      setCustomIcons(data.map((e: any) => ({
        docId: String(e.documentId ?? e.id), key: e.key, name: e.name,
        imageUrl: e.image?.url, svg: e.svg || undefined, viewBox: e.viewBox || undefined, tenantKey: e.tenant?.key,
      })));
    } catch {}
  }, []);
  useEffect(() => { loadIcons(); }, [loadIcons]);

  // Every edit goes through applyItems so the latest list is also in a ref that
  // is updated synchronously. Saving reads that ref when it runs, never a
  // render-time closure, so it always sends the newest values.
  const itemsRef = useRef<NavItem[]>([]);
  function applyItems(fn: (list: NavItem[]) => NavItem[]) {
    const next = fn(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }
  // One save at a time per item, in order. Blurring several fields in a row
  // used to fire overlapping PUTs; whichever reached the server last won, so a
  // field typed earlier (the featured link label, the description) could land
  // after — and wipe out — a later one. Queued, each save sends the item as it
  // is when its turn comes, so the last write is always the newest.
  const saveChains = useRef<Record<string, Promise<void>>>({});
  function queueSave(docId: string) {
    const run = async () => {
      const it = itemsRef.current.find((x) => x.docId === docId);
      if (!it) return;
      try {
        await cms.entries.update(UID, docId, { label: it.label, labelEn: it.labelEn, url: it.url, openNewTab: it.openNewTab, order: it.order, megaMenu: it.megaMenu });
        await publish(docId);
      } catch {}
    };
    saveChains.current[docId] = (saveChains.current[docId] || Promise.resolve()).then(run);
  }

  const load = useCallback(async () => {
    if (!tenantKey) { applyItems(() => []); return; }
    try {
      const { data } = await cms.entries.list<any>(UID, {
        filter: [{ field: "tenant.key", op: "eq", value: tenantKey }],
        sort: "order:asc", pageSize: 100,
      });
      const flat = (data || []).filter((r: any) => !r.column);
      const loaded: NavItem[] = flat.map((r: any) => ({
        docId: String(r.documentId ?? r.id), label: r.label || "", labelEn: r.labelEn || "", url: r.url || "#",
        openNewTab: !!r.openNewTab, order: r.order ?? 0, megaMenu: normalizeMega(r.megaMenu),
      }));
      applyItems(() => loaded);
    } catch {}
  }, [tenantKey]);
  useEffect(() => { load(); }, [load]);

  async function publish(docId: string) {
    try { await cms.publish.publish(UID, docId); } catch {}
  }

  async function add(kind: NavKind = "normal") {
    setBusy(true); setMsg(null);
    try {
      const result: any = await cms.entries.create(UID, { label: t("nv.add"), labelEn: "", url: "#", order: items.length + 1, openNewTab: false, megaMenu: kind === "normal" ? null : { ...EMPTY_MEGA } });
      const docId = String(result?.documentId ?? result?.id);
      await publish(docId);
      await load();
      if (kind !== "normal") setExpanded(docId);
      setMsg({ t: t("nv.saved"), ok: true });
    } catch (e) {
      setMsg({ t: e instanceof CmsError ? "Save failed (HTTP " + e.status + ")" : "Cannot reach the backend.", ok: false });
    } finally { setBusy(false); }
  }

  function save(it: NavItem, patch: Partial<NavItem>) {
    applyItems((list) => list.map((x) => (x.docId === it.docId ? { ...x, ...patch } : x)));
    queueSave(it.docId);
  }

  async function remove(it: NavItem) {
    setBusy(true);
    try { await cms.entries.remove(UID, it.docId); await load(); } catch {}
    finally { setBusy(false); }
  }

  async function reorder(from: number, to: number) {
    if (from < 0 || from === to) return;
    const list = items.slice();
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const renumbered = list.map((x, i) => ({ ...x, order: i + 1 }));
    applyItems(() => renumbered);
    setBusy(true);
    try {
      await Promise.all(renumbered.map((x) => cms.entries.update(UID, x.docId, { order: x.order })));
      await Promise.all(renumbered.map((x) => publish(x.docId)));
    } catch {}
    finally { setBusy(false); }
  }

  // Text-field edits: update local state on every keystroke (responsive
  // typing), save on blur — same rhythm as the label/url fields above, just
  // reaching one level (or two) deeper into `megaMenu`.
  function setMegaLocal(docId: string, mutator: (m: MegaMenu) => MegaMenu) {
    applyItems((list) => list.map((x) => (x.docId === docId ? { ...x, megaMenu: mutator(x.megaMenu || { ...EMPTY_MEGA }) } : x)));
  }
  // Saves the item as it is when its turn in the queue comes (see queueSave), so
  // it's safe to call right after a setMegaLocal in the same handler.
  function commitMega(docId: string) {
    queueSave(docId);
  }
  // Structural edits (toggle/add/remove) have no natural blur event, so they
  // mutate and save together, using the freshly-computed value.
  function mutateMegaAndSave(docId: string, mutator: (m: MegaMenu | null) => MegaMenu | null) {
    applyItems((list) => list.map((x) => (x.docId === docId ? { ...x, megaMenu: mutator(x.megaMenu) } : x)));
    queueSave(docId);
  }

  // Switch an item between a plain link and a dropdown (hover / click). Keeps
  // everything already typed into the dropdown when moving between the two
  // dropdown kinds; going back to "normal" drops it, same as unticking the
  // old checkbox did.
  function setKind(it: NavItem, kind: NavKind) {
    mutateMegaAndSave(it.docId, (m) => (kind === "normal" ? null : { ...(m || EMPTY_MEGA), trigger: "click" }));
    setExpanded(kind === "normal" ? null : it.docId);
  }
  function addGroup(docId: string) {
    mutateMegaAndSave(docId, (m) => (m ? { ...m, groups: [...m.groups, { ...EMPTY_GROUP, links: [] }] } : m));
  }
  function removeGroup(docId: string, gi: number) {
    mutateMegaAndSave(docId, (m) => (m ? { ...m, groups: m.groups.filter((_, i) => i !== gi) } : m));
  }
  // `path` is relative to the group's own links tree — [] adds/targets a
  // top-level link, [i, ...] descends into link i's children first (see the
  // updateLinkAt/removeLinkAt/addLinkAt tree helpers above).
  function addLink(docId: string, gi: number, path: number[] = []) {
    mutateMegaAndSave(docId, (m) => (m ? { ...m, groups: m.groups.map((g, i) => (i === gi ? { ...g, links: addLinkAt(g.links, path) } : g)) } : m));
  }
  function removeLink(docId: string, gi: number, path: number[]) {
    mutateMegaAndSave(docId, (m) => (m ? { ...m, groups: m.groups.map((g, i) => (i === gi ? { ...g, links: removeLinkAt(g.links, path) } : g)) } : m));
  }
  function setGroupLocal(docId: string, gi: number, patch: Partial<MegaGroup>) {
    setMegaLocal(docId, (m) => ({ ...m, groups: m.groups.map((x, i) => (i === gi ? { ...x, ...patch } : x)) }));
  }
  function editLinkLocal(docId: string, gi: number, path: number[], patch: Partial<MegaLink>) {
    setMegaLocal(docId, (m) => ({ ...m, groups: m.groups.map((g, i) => (i === gi ? { ...g, links: updateLinkAt(g.links, path, patch) } : g)) }));
  }

  return (
    <div className="panel">
      <IconSpriteDefs />
      <div className="panel-h">
        <div><h3>{t("br.tab_nav")}</h3><span className="sub">{t("nv.sub")}</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => add("normal")} disabled={busy || !tenantKey}><Icon name="plus" />{t("nv.add")}</button>
          <button className="btn btn--p" onClick={() => add("stack")} disabled={busy || !tenantKey}><Icon name="plus" />{t("nv.addstack")}</button>
        </div>
      </div>
      {msg && <div style={{ marginBottom: 10 }}><span className={"toast-in " + (msg.ok ? "ok" : "bad")}>{msg.t}</span></div>}

      {items.length === 0 && <div className="muted" style={{ padding: 12 }}>{t("nv.empty")}</div>}

      {items.map((it, i) => (
        <div key={it.docId} style={{ marginBottom: 10 }}>
          <div className={"panel nav-item-row" + (dragI === i ? " drag" : "")} style={{ background: "var(--sunk)", display: "flex", alignItems: "center", gap: 10 }}
            draggable onDragStart={() => setDragI(i)} onDragEnd={() => setDragI(-1)}
            onDragOver={(e) => e.preventDefault()} onDrop={() => { reorder(dragI, i); setDragI(-1); }}>
            <div className="vb-grip" title="drag to reorder"><Icon name="drag" /></div>
            <input style={fieldStyle}
              value={it.label} onChange={(e) => applyItems((l) => l.map((x) => (x.docId === it.docId ? { ...x, label: e.target.value } : x)))}
              onBlur={() => save(it, {})} placeholder={t("nv.label")} />
            <input style={fieldStyle}
              value={it.labelEn} onChange={(e) => applyItems((l) => l.map((x) => (x.docId === it.docId ? { ...x, labelEn: e.target.value } : x)))}
              onBlur={() => save(it, {})} placeholder={t("nv.labelEn")} />
            <input style={fieldStyle}
              value={it.url} onChange={(e) => applyItems((l) => l.map((x) => (x.docId === it.docId ? { ...x, url: e.target.value } : x)))}
              onBlur={() => save(it, {})} placeholder={t("nv.url")} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink2)", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={it.openNewTab} onChange={(e) => save(it, { openNewTab: e.target.checked })} /> {t("nv.newtab")}
            </label>
            <select style={{ ...fieldStyle, flex: "none", width: "auto", cursor: "pointer" }} aria-label={t("nv.type")} title={t("nv.type")}
              value={it.megaMenu ? "stack" : "bar"} onChange={(e) => setKind(it, e.target.value === "stack" ? "stack" : "normal")}>
              <option value="bar">{t("nv.type.bar")}</option>
              <option value="stack">{t("nv.type.stack")}</option>
            </select>
            {it.megaMenu && (
              <button className="ic-btn" title={t("nv.mega.expand")} onClick={() => setExpanded(expanded === it.docId ? null : it.docId)}>
                <Icon name={expanded === it.docId ? "chevron-up" : "chevron-down"} />
              </button>
            )}
            <button className="ic-btn" style={{ color: "var(--bad)" }} onClick={() => remove(it)}><Icon name="trash" /></button>
          </div>

          {expanded === it.docId && (
            <div className="panel" style={{ background: "var(--panel)", border: "1px solid var(--line2)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 14 }}>

              {it.megaMenu && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.icon")}</div>
                      <NavIconField value={it.megaMenu.icon} customIcons={customIcons} onLibraryChanged={loadIcons} t={t}
                        onChange={(v) => { setMegaLocal(it.docId, (m) => ({ ...m, icon: v })); commitMega(it.docId); }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.eyebrow")}</div>
                      <input style={{ ...fieldStyle, width: "100%" }}
                        value={it.megaMenu.eyebrow} onChange={(e) => setMegaLocal(it.docId, (m) => ({ ...m, eyebrow: e.target.value }))}
                        onBlur={() => commitMega(it.docId)} />
                    </div>
                  </div>

                  <div>
                    <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.title")}</div>
                    <input style={{ ...fieldStyle, width: "100%" }}
                      value={it.megaMenu.title} onChange={(e) => setMegaLocal(it.docId, (m) => ({ ...m, title: e.target.value }))}
                      onBlur={() => commitMega(it.docId)} />
                  </div>

                  <div>
                    <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.description")}</div>
                    <textarea rows={2} style={{ ...fieldStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
                      value={it.megaMenu.description} onChange={(e) => setMegaLocal(it.docId, (m) => ({ ...m, description: e.target.value }))}
                      onBlur={() => commitMega(it.docId)} />
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.featuredlabel")}</div>
                      <input style={{ ...fieldStyle, width: "100%" }}
                        value={it.megaMenu.featuredLabel} onChange={(e) => setMegaLocal(it.docId, (m) => ({ ...m, featuredLabel: e.target.value }))}
                        onBlur={() => commitMega(it.docId)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.featuredurl")}</div>
                      <input style={{ ...fieldStyle, width: "100%" }}
                        value={it.megaMenu.featuredUrl} onChange={(e) => setMegaLocal(it.docId, (m) => ({ ...m, featuredUrl: e.target.value }))}
                        onBlur={() => commitMega(it.docId)} />
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid var(--line2)", paddingTop: 10, marginTop: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <strong style={{ fontSize: 13 }}>{t("nv.mega.groups")}</strong>
                      <button className="btn" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => addGroup(it.docId)}>
                        <Icon name="plus" />{t("nv.mega.addgroup")}
                      </button>
                    </div>

                    {it.megaMenu.groups.map((g, gi) => (
                      <div key={gi} style={{ background: "var(--sunk)", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.title")}</div>
                            <input style={{ ...fieldStyle, width: "100%" }} placeholder={t("nv.mega.heading")}
                              value={g.heading}
                              onChange={(e) => setGroupLocal(it.docId, gi, { heading: e.target.value })}
                              onBlur={() => commitMega(it.docId)} />
                          </div>
                          <button className="ic-btn" style={{ color: "var(--bad)" }} title={t("nv.mega.removegroup")} onClick={() => removeGroup(it.docId, gi)}>
                            <Icon name="close" />
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.icon")}</div>
                            <NavIconField value={g.icon || ""} customIcons={customIcons} onLibraryChanged={loadIcons} t={t}
                              onChange={(v) => { setGroupLocal(it.docId, gi, { icon: v }); commitMega(it.docId); }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.eyebrow")}</div>
                            <input style={{ ...fieldStyle, width: "100%" }}
                              value={g.eyebrow || ""} onChange={(e) => setGroupLocal(it.docId, gi, { eyebrow: e.target.value })}
                              onBlur={() => commitMega(it.docId)} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.description")}</div>
                          <textarea rows={2} style={{ ...fieldStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
                            value={g.description || ""} onChange={(e) => setGroupLocal(it.docId, gi, { description: e.target.value })}
                            onBlur={() => commitMega(it.docId)} />
                        </div>
                        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.featuredlabel")}</div>
                            <input style={{ ...fieldStyle, width: "100%" }}
                              value={g.featuredLabel || ""} onChange={(e) => setGroupLocal(it.docId, gi, { featuredLabel: e.target.value })}
                              onBlur={() => commitMega(it.docId)} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.featuredurl")}</div>
                            <input style={{ ...fieldStyle, width: "100%" }}
                              value={g.featuredUrl || ""} onChange={(e) => setGroupLocal(it.docId, gi, { featuredUrl: e.target.value })}
                              onBlur={() => commitMega(it.docId)} />
                          </div>
                        </div>
                        <div className="sub" style={{ marginBottom: 6 }}>{t("nv.mega.links")}</div>

                        {g.links.map((l, li) => (
                          <LinkEditor key={li} link={l} path={[li]} depth={0} t={t}
                            onChangeLocal={(path, patch) => editLinkLocal(it.docId, gi, path, patch)}
                            onCommit={() => commitMega(it.docId)}
                            onRemove={(path) => removeLink(it.docId, gi, path)}
                            onAddChild={(path) => addLink(it.docId, gi, path)} />
                        ))}
                        <button className="btn" style={{ fontSize: 12, padding: "4px 9px", marginLeft: 12 }} onClick={() => addLink(it.docId, gi, [])}>
                          <Icon name="plus" />{t("nv.mega.addlink")}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
