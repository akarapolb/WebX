"use client";
// The Builder's toolbox — the panel you pick things to place from.
//
// Replaces the icon+label grid that used to sit at the BOTTOM of the
// inspector (.vb-add): that grid shared one scroll container with the block
// list, so reaching it on a long page meant scrolling past every block's
// expanded property form, and it had room for nothing but two columns of
// text buttons. This is its own pane with its own scroll, three tabs, and a
// visual tile per entry.
//
// Three tabs over ONE interaction model (click to append at the end, drag to
// drop at a specific position — both already existed and are unchanged):
// built-in block types for the tenant's own template, saved page templates,
// and this workspace's custom block types.
//
// The canvas's insert-between "+" popup renders this same component with
// `compact`, so that path gets search/categories/thumbnails too instead of
// the flat unsearchable list of every type it used to show.
//
// THUMBNAILS ARE SCHEMATIC, NOT LIVE RENDERS. A real render per tile would
// need one iframe each — RealPreview.tsx is a whole document that loads the
// tenant's real stylesheets (and for orst/royalsociety a cross-origin
// harness route), which is nowhere near cheap enough for a 25-50 tile grid
// that must stay responsive while you type in the search box. Instead each
// tile draws a silhouette derived from the type's OWN palette descriptor
// (its icon, its items list, its column count), so a 3-column card grid
// draws three boxes, a link list draws rows, a hero draws a big heading bar.
// That is what makes the grid scannable at a glance without pretending to be
// a pixel-accurate preview — the canvas next to it already is one.
import { useMemo, useState } from "react";
import Icon from "./Icon";
import type { BlockType } from "./BlockTypeEditor";

export type PageTemplate = {
  docId?: string;
  key: string;
  name: string;
  description?: string;
  /** Which public template's dialect these blocks belong to ("gov-portal" |
   * "orst" | "royalsociety") — a template is only offered to a tenant on the
   * same one, same rule paletteTypes already applies to block types. */
  dialect?: string;
  blocks: any[];
  tenantKey?: string;
};

/** The subset of VisualBuilder's palette descriptor this component reads. */
export type ToolboxType = {
  comp: string;
  key: string;
  icon: string;
  cat: string;
  def?: any;
  items?: { key: string };
};

type Tab = "blocks" | "templates" | "custom";

const Bar = ({ w, h = 5 }: { w: number | string; h?: number }) => (
  <i className="tbx-bar" style={{ width: typeof w === "number" ? w + "%" : w, height: h }} />
);
const Box = ({ grow }: { grow?: boolean }) => <i className={"tbx-box" + (grow ? " g" : "")} />;

/** Silhouette for one block type — see this file's header on why schematic. */
function Thumb({ icon, items, cols }: { icon: string; items: number; cols: number }) {
  const n = Math.max(1, Math.min(items || cols, 6));
  const boxes = Array.from({ length: n }, (_, i) => <Box key={i} />);
  if (icon === "layout") return (
    <div className="tbx-th">
      <Bar w={28} h={4} /><Bar w={78} h={10} /><Bar w={60} /><i className="tbx-pill" />
    </div>
  );
  if (icon === "cta") return (
    <div className="tbx-th tbx-row">
      <div className="tbx-col"><Bar w={80} h={8} /><Bar w={55} /></div><i className="tbx-pill" />
    </div>
  );
  if (icon === "grid" || icon === "card" || icon === "star") return (
    <div className="tbx-th">
      <Bar w={45} h={7} />
      <div className="tbx-grid" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 4)},1fr)` }}>{boxes}</div>
    </div>
  );
  if (icon === "doc") return (
    <div className="tbx-th">
      <Bar w={50} h={7} />
      {Array.from({ length: Math.min(n, 4) }, (_, i) => <Bar key={i} w={i % 2 ? 72 : 88} />)}
    </div>
  );
  if (icon === "img") return (
    <div className="tbx-th"><Box grow /><Bar w={45} h={4} /></div>
  );
  if (icon === "inbox") return (
    <div className="tbx-th">
      <Bar w={45} h={7} /><i className="tbx-field" /><i className="tbx-field" /><i className="tbx-pill" />
    </div>
  );
  if (icon === "msg") return (
    <div className="tbx-th"><span className="tbx-quote">”</span><Bar w={85} /><Bar w={65} /><Bar w={30} h={4} /></div>
  );
  if (icon === "users") return (
    <div className="tbx-th">
      <Bar w={45} h={7} />
      <div className="tbx-row" style={{ gap: 6 }}>{Array.from({ length: Math.min(n, 4) }, (_, i) => <i className="tbx-dot" key={i} />)}</div>
    </div>
  );
  if (icon === "code") return (
    <div className="tbx-th tbx-code"><Bar w={40} h={4} /><Bar w={70} h={4} /><Bar w={55} h={4} /><Bar w={30} h={4} /></div>
  );
  return <div className="tbx-th"><Bar w={55} h={8} /><Bar w={80} /><Bar w={65} /></div>;
}

/** A page-shaped silhouette for a saved template: one band per block, in
 * order, so two templates with different structures look different. */
function TemplateThumb({ blocks }: { blocks: any[] }) {
  const rows = (blocks || []).slice(0, 6);
  return (
    <div className="tbx-th tbx-tpl">
      {rows.length === 0 && <Bar w={70} h={8} />}
      {rows.map((b, i) => {
        const c: string = b?.__component || b?.type || "";
        const tall = i === 0 || /hero/.test(c);
        return <i key={i} className={"tbx-band" + (tall ? " t" : "")} />;
      })}
    </div>
  );
}

export default function Toolbox({
  types, categories, customTypes, templates, dialect, t,
  compact, onAdd, onAddCustom, onApplyTemplate, onDragNew, onDragEnd,
  onManageTypes, onManageIcons, onSaveTemplate, onManageTemplates, canManage,
  ai,
}: {
  types: ToolboxType[];
  categories: { key: string; labelKey: string }[];
  customTypes: BlockType[];
  templates: PageTemplate[];
  dialect: string;
  t: (k: string) => string;
  compact?: boolean;
  onAdd: (comp: string) => void;
  onAddCustom: (ct: BlockType) => void;
  onApplyTemplate: (tpl: PageTemplate, mode: "replace" | "append") => void;
  onDragNew: (p: { comp?: string; custom?: BlockType; template?: PageTemplate }) => void;
  onDragEnd: () => void;
  onManageTypes?: () => void;
  onManageIcons?: () => void;
  onSaveTemplate?: () => void;
  onManageTemplates?: () => void;
  /** Strapi-only maintenance actions — hidden entirely under a WordPress
   * session, where the underlying content-manager fetches 401 (same reason
   * the old inspector footer hid them). */
  canManage?: boolean;
  ai?: { prompt: string; busy: boolean; setPrompt: (v: string) => void; run: () => void };
}) {
  const [tab, setTab] = useState<Tab>("blocks");
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  // Only templates authored against this tenant's own public template can be
  // applied — a gov-portal template's `block.*` components mean nothing to an
  // ORST page and would render as unknown blocks. Same filter rule as
  // VisualBuilder's paletteTypes.
  const myTemplates = useMemo(
    () => templates.filter((x) => (x.dialect || "gov-portal") === dialect),
    [templates, dialect]
  );

  const fTypes = useMemo(
    () => (query ? types.filter((x) => t(x.key).toLowerCase().includes(query) || x.comp.toLowerCase().includes(query)) : types),
    [types, query, t]
  );
  const fCustom = useMemo(
    () => (query ? customTypes.filter((c) => (c.name || "").toLowerCase().includes(query)) : customTypes),
    [customTypes, query]
  );
  const fTemplates = useMemo(
    () => (query ? myTemplates.filter((x) => (x.name || "").toLowerCase().includes(query)) : myTemplates),
    [myTemplates, query]
  );

  const tile = (ty: ToolboxType) => {
    const itemsN = ty.items && Array.isArray(ty.def?.[ty.items.key]) ? ty.def[ty.items.key].length : 0;
    const cols = Number(ty.def?.columns) || 3;
    return (
      <button key={ty.comp} className="tbx-tile" draggable
        onDragStart={() => onDragNew({ comp: ty.comp })} onDragEnd={onDragEnd}
        onClick={() => onAdd(ty.comp)} title={t(ty.key)}>
        <Thumb icon={ty.icon} items={itemsN} cols={cols} />
        <span className="tbx-tile-l"><Icon name={ty.icon} />{t(ty.key)}</span>
      </button>
    );
  };

  const customTile = (ct: BlockType) => (
    <button key={ct.key} className="tbx-tile" draggable
      onDragStart={() => onDragNew({ custom: ct })} onDragEnd={onDragEnd}
      onClick={() => onAddCustom(ct)} title={ct.name}>
      <Thumb icon={ct.icon || "grid"} items={(ct.fieldsSchema || []).length} cols={2} />
      <span className="tbx-tile-l"><Icon name={ct.icon || "grid"} />{ct.name}</span>
    </button>
  );

  const tplTile = (tpl: PageTemplate) => (
    <div key={tpl.docId || tpl.key} className="tbx-tile tbx-tile-tpl" title={tpl.description || tpl.name}>
      <button className="tbx-tpl-drag" draggable
        onDragStart={() => onDragNew({ template: tpl })} onDragEnd={onDragEnd}
        onClick={() => onApplyTemplate(tpl, "append")}>
        <TemplateThumb blocks={tpl.blocks} />
        <span className="tbx-tile-l"><Icon name="layout" />{tpl.name}</span>
      </button>
      <div className="tbx-tpl-a">
        <span className="tbx-count">{(tpl.blocks || []).length} {t("tbx.blockcount")}</span>
        {/* Compact mode inserts AT the clicked position, so a whole-page
            "Replace" there would contradict the gesture that opened it. */}
        {!compact && <button onClick={() => onApplyTemplate(tpl, "replace")} title={t("tbx.replacehint")}>{t("tbx.replace")}</button>}
      </div>
    </div>
  );

  const empty = (msg: string) => <div className="tbx-empty">{msg}</div>;

  return (
    <div className={"tbx" + (compact ? " tbx-compact" : "")}>
      {!compact && (
        <div className="tbx-tabs seg">
          <button className={tab === "blocks" ? "on" : ""} onClick={() => setTab("blocks")}><Icon name="grid" />{t("tbx.blocks")}</button>
          <button className={tab === "templates" ? "on" : ""} onClick={() => setTab("templates")}><Icon name="layout" />{t("tbx.templates")}</button>
          {customTypes.length > 0 && <button className={tab === "custom" ? "on" : ""} onClick={() => setTab("custom")}><Icon name="code" />{t("tbx.custom")}</button>}
        </div>
      )}

      <div className="vb-search tbx-search">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(compact ? "vb.searchblocks" : "tbx.search")} />
        {q && <button aria-label={t("a11y.clear")} title={t("a11y.clear")} onClick={() => setQ("")}><Icon name="close" /></button>}
      </div>

      <div className="tbx-scroll">
        {/* Compact mode (the canvas "+" popup) is one flat searchable grid of
            everything placeable at that position — tabs would need a second
            click inside a popover that is already a transient surface. */}
        {compact ? (
          <>
            {!fTypes.length && !fCustom.length && !fTemplates.length && empty(t("vb.noblockmatch"))}
            {fTypes.length > 0 && <div className="tbx-grid-tiles">{fTypes.map(tile)}</div>}
            {fCustom.length > 0 && <>
              <div className="vb-cat-label">{t("vb.custom")}</div>
              <div className="tbx-grid-tiles">{fCustom.map(customTile)}</div>
            </>}
            {fTemplates.length > 0 && <>
              <div className="vb-cat-label">{t("tbx.templates")}</div>
              <div className="tbx-grid-tiles">{fTemplates.map(tplTile)}</div>
            </>}
          </>
        ) : tab === "blocks" ? (
          <>
            {!fTypes.length && empty(t("vb.noblockmatch"))}
            {query ? (
              <div className="tbx-grid-tiles">{fTypes.map(tile)}</div>
            ) : (
              categories.map((c) => {
                const list = types.filter((ty) => ty.cat === c.key);
                if (!list.length) return null;
                return (
                  <div key={c.key}>
                    <div className="vb-cat-label">{t(c.labelKey)}</div>
                    <div className="tbx-grid-tiles">{list.map(tile)}</div>
                  </div>
                );
              })
            )}
          </>
        ) : tab === "templates" ? (
          <>
            {!fTemplates.length && empty(t(query ? "vb.noblockmatch" : "tbx.notemplates"))}
            {fTemplates.length > 0 && <div className="tbx-grid-tiles">{fTemplates.map(tplTile)}</div>}
          </>
        ) : (
          <>
            {!fCustom.length && empty(t("vb.noblockmatch"))}
            {fCustom.length > 0 && <div className="tbx-grid-tiles">{fCustom.map(customTile)}</div>}
          </>
        )}
      </div>

      {!compact && (
        <div className="tbx-foot">
          {ai && (
            <div className="vb-ai">
              <Icon name="spark" />
              <input value={ai.prompt} placeholder={t("vb.aiph")} onChange={(e) => ai.setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ai.run()} />
              <button className="vb-ai-btn" onClick={ai.run} disabled={ai.busy || !ai.prompt.trim()}>{ai.busy ? t("vb.aigen") : t("vb.aibtn")}</button>
            </div>
          )}
          {canManage && (
            <div className="tbx-foot-b">
              {onSaveTemplate && <button className="vb-add-btn" onClick={onSaveTemplate}><Icon name="plus" />{t("tbx.savetpl")}</button>}
              {onManageTemplates && <button className="vb-add-btn" onClick={onManageTemplates}><Icon name="layout" />{t("tbx.managetpl")}</button>}
              {onManageTypes && <button className="vb-add-btn" onClick={onManageTypes}><Icon name="code" />{t("vb.manage")}</button>}
              {onManageIcons && <button className="vb-add-btn" onClick={onManageIcons}><Icon name="img" />{t("ic.manage")}</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
