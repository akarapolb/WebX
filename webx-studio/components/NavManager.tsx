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
import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import { useLang } from "./LangProvider";
import { cms, CmsError } from "@/lib/cms";

const UID = "api::menu-item.menu-item";

type MegaLink = { text: string; url: string; desc: string; children?: MegaLink[] };
type MegaGroup = { heading: string; links: MegaLink[] };
type MegaMenu = { icon: string; eyebrow: string; title: string; description: string; featuredLabel: string; featuredUrl: string; groups: MegaGroup[] };
type NavItem = { docId: string; label: string; labelEn: string; url: string; openNewTab: boolean; order: number; megaMenu: MegaMenu | null };

const EMPTY_MEGA: MegaMenu = { icon: "", eyebrow: "", title: "", description: "", featuredLabel: "", featuredUrl: "", groups: [] };
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
    groups: Array.isArray(raw.groups)
      ? raw.groups.map((g: any) => ({
          heading: g?.heading || "",
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

const fieldStyle = { flex: 1, background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 9, padding: "9px 11px", fontSize: 13, color: "var(--ink)" } as const;

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
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
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

  const load = useCallback(async () => {
    if (!tenantKey) { setItems([]); return; }
    try {
      const { data } = await cms.entries.list<any>(UID, {
        filter: [{ field: "tenant.key", op: "eq", value: tenantKey }],
        sort: "order:asc", pageSize: 100,
      });
      const flat = (data || []).filter((r: any) => !r.column);
      setItems(flat.map((r: any) => ({
        docId: String(r.documentId ?? r.id), label: r.label || "", labelEn: r.labelEn || "", url: r.url || "#",
        openNewTab: !!r.openNewTab, order: r.order ?? 0, megaMenu: normalizeMega(r.megaMenu),
      })));
    } catch {}
  }, [tenantKey]);
  useEffect(() => { load(); }, [load]);

  async function publish(docId: string) {
    try { await cms.publish.publish(UID, docId); } catch {}
  }

  async function add() {
    setBusy(true); setMsg(null);
    try {
      const result: any = await cms.entries.create(UID, { label: t("nv.add"), labelEn: "", url: "#", order: items.length + 1, openNewTab: false, megaMenu: null });
      const docId = String(result?.documentId ?? result?.id);
      await publish(docId);
      await load();
      setMsg({ t: t("nv.saved"), ok: true });
    } catch (e) {
      setMsg({ t: e instanceof CmsError ? "Save failed (HTTP " + e.status + ")" : "Cannot reach the backend.", ok: false });
    } finally { setBusy(false); }
  }

  async function save(it: NavItem, patch: Partial<NavItem>) {
    const next = { ...it, ...patch };
    setItems((list) => list.map((x) => (x.docId === it.docId ? next : x)));
    try {
      await cms.entries.update(UID, it.docId, { label: next.label, labelEn: next.labelEn, url: next.url, openNewTab: next.openNewTab, order: next.order, megaMenu: next.megaMenu });
      await publish(it.docId);
    } catch {}
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
    setItems(renumbered);
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
    setItems((list) => list.map((x) => (x.docId === docId ? { ...x, megaMenu: mutator(x.megaMenu || { ...EMPTY_MEGA }) } : x)));
  }
  // Reads the CURRENT state (not a stale closure) at commit time, so it's
  // safe to call right after a setMegaLocal in the same handler.
  function commitMega(docId: string) {
    setItems((list) => {
      const it = list.find((x) => x.docId === docId);
      if (it) { cms.entries.update(UID, docId, { megaMenu: it.megaMenu }).then(() => publish(docId)).catch(() => {}); }
      return list;
    });
  }
  // Structural edits (toggle/add/remove) have no natural blur event, so they
  // mutate and save together, using the freshly-computed value.
  function mutateMegaAndSave(docId: string, mutator: (m: MegaMenu | null) => MegaMenu | null) {
    setItems((list) => {
      const next = list.map((x) => (x.docId === docId ? { ...x, megaMenu: mutator(x.megaMenu) } : x));
      const it = next.find((x) => x.docId === docId);
      if (it) { cms.entries.update(UID, docId, { megaMenu: it.megaMenu }).then(() => publish(docId)).catch(() => {}); }
      return next;
    });
  }

  function toggleMega(it: NavItem) {
    mutateMegaAndSave(it.docId, (m) => (m ? null : { ...EMPTY_MEGA }));
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
  function editLinkLocal(docId: string, gi: number, path: number[], patch: Partial<MegaLink>) {
    setMegaLocal(docId, (m) => ({ ...m, groups: m.groups.map((g, i) => (i === gi ? { ...g, links: updateLinkAt(g.links, path, patch) } : g)) }));
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <div><h3>{t("br.tab_nav")}</h3><span className="sub">{t("nv.sub")}</span></div>
        <button className="btn btn--p" onClick={add} disabled={busy || !tenantKey}><Icon name="plus" />{t("nv.add")}</button>
      </div>
      {msg && <div style={{ marginBottom: 10 }}><span className={"toast-in " + (msg.ok ? "ok" : "bad")}>{msg.t}</span></div>}

      {items.length === 0 && <div className="muted" style={{ padding: 12 }}>{t("nv.empty")}</div>}

      {items.map((it, i) => (
        <div key={it.docId} style={{ marginBottom: 10 }}>
          <div className={"panel" + (dragI === i ? " drag" : "")} style={{ background: "var(--sunk)", display: "flex", alignItems: "center", gap: 10 }}
            draggable onDragStart={() => setDragI(i)} onDragEnd={() => setDragI(-1)}
            onDragOver={(e) => e.preventDefault()} onDrop={() => { reorder(dragI, i); setDragI(-1); }}>
            <div className="vb-grip" title="drag to reorder"><Icon name="drag" /></div>
            <input style={fieldStyle}
              value={it.label} onChange={(e) => setItems((l) => l.map((x) => (x.docId === it.docId ? { ...x, label: e.target.value } : x)))}
              onBlur={() => save(it, {})} placeholder={t("nv.label")} />
            <input style={fieldStyle}
              value={it.labelEn} onChange={(e) => setItems((l) => l.map((x) => (x.docId === it.docId ? { ...x, labelEn: e.target.value } : x)))}
              onBlur={() => save(it, {})} placeholder={t("nv.labelEn")} />
            <input style={fieldStyle}
              value={it.url} onChange={(e) => setItems((l) => l.map((x) => (x.docId === it.docId ? { ...x, url: e.target.value } : x)))}
              onBlur={() => save(it, {})} placeholder={t("nv.url")} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink2)", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={it.openNewTab} onChange={(e) => save(it, { openNewTab: e.target.checked })} /> {t("nv.newtab")}
            </label>
            <button className="ic-btn" title={t("nv.mega.expand")} onClick={() => setExpanded(expanded === it.docId ? null : it.docId)}>
              <Icon name={expanded === it.docId ? "chevron-up" : "chevron-down"} />
            </button>
            <button className="ic-btn" style={{ color: "var(--bad)" }} onClick={() => remove(it)}><Icon name="trash" /></button>
          </div>

          {expanded === it.docId && (
            <div className="panel" style={{ background: "var(--panel)", border: "1px solid var(--line2)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: it.megaMenu ? 14 : 0 }}>
                <input type="checkbox" checked={!!it.megaMenu} onChange={() => toggleMega(it)} /> {t("nv.mega.toggle")}
              </label>

              {it.megaMenu && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div className="sub" style={{ marginBottom: 4 }}>{t("nv.mega.icon")}</div>
                      <input style={{ ...fieldStyle, width: "100%" }} placeholder={t("nv.mega.iconhint")}
                        value={it.megaMenu.icon} onChange={(e) => setMegaLocal(it.docId, (m) => ({ ...m, icon: e.target.value }))}
                        onBlur={() => commitMega(it.docId)} />
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
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                          <input style={{ ...fieldStyle, width: "100%" }} placeholder={t("nv.mega.heading")}
                            value={g.heading}
                            onChange={(e) => setMegaLocal(it.docId, (m) => ({ ...m, groups: m.groups.map((x, i) => (i === gi ? { ...x, heading: e.target.value } : x)) }))}
                            onBlur={() => commitMega(it.docId)} />
                          <button className="ic-btn" style={{ color: "var(--bad)" }} title={t("nv.mega.removegroup")} onClick={() => removeGroup(it.docId, gi)}>
                            <Icon name="close" />
                          </button>
                        </div>

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
