"use client";
// The Visual Builder sidebar's editor for a WordPress-dialect (ORST /
// RoyalSociety / shared) block: every piece of the block the template's own
// Blocks.tsx can render — scalar fields, small objects (a section's "view
// all" link) and repeatable lists, nested to any depth (media-tabs'
// tabs[].items[]) — as defined by the block's catalog entry (lib/
// blockCatalog.ts), not by whatever keys the stored block happens to have.
//
// Components are added and removed freely: only the ones the block
// currently HAS are listed (each with a remove ×), and the rest are offered
// in the "+ Add component" picker at the bottom. Removing deletes the key
// outright rather than blanking it, which every renderer treats as "don't
// render this element" — so what the sidebar shows is exactly what the page
// renders. Fields marked `keep` (the renderer always draws them, or a
// built-in default) can be edited but not removed.
//
// Every mutation goes through the same update/arrayAdd/arrayRemove
// callbacks VisualBuilder's other editors use, so undo/redo and
// dirty-tracking behave identically.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";
import IconPicker from "./IconPicker";
import type { CustomIcon } from "./IconManager";
import { FEATURE_ICONS } from "./blockPreview/iconChoices";
import type { Path } from "./blockPreview/editing";
import { useLang } from "./LangProvider";
import { applies, freshDef, listsOf, type BlockTypeMeta, type ItemField, type ListDesc, type ObjDesc } from "@/lib/blockCatalog";

type Ops = {
  update: (path: Path, value: any) => void;
  arrayAdd: (path: Path, item: any) => void;
  arrayRemove: (path: Path, k: number) => void;
};
type Ctx = Ops & {
  block: any; template?: string; customIcons: CustomIcon[]; t: (k: string) => string;
  /** Reload the icon library after the picker saves a Material icon into it. */
  onIconsChanged?: () => void | Promise<void>;
  moved: Record<string, any>; selectedComp: string | null;
  onPickComp?: (key: string | null) => void; onResetBox?: (key: string) => void;
};

// "Moved/resized on this device" marker + reset, next to a component's label.
function MovedChip({ k, ctx }: { k: string; ctx: Ctx }) {
  const b = ctx.moved[k];
  if (!b || !ctx.onResetBox) return null;
  const parts = [(b.x || b.y) ? `${b.x || 0},${b.y || 0}` : "", (b.w || b.h) ? `${b.w ?? "·"}×${b.h ?? "·"}` : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className="bc-chip" title={ctx.t("vb.comp.layout.reset")} onClick={(e) => { e.stopPropagation(); ctx.onResetBox!(k); }}>
      ↺ <span className="mono">{parts || ctx.t("vb.comp.layout.movedone")}</span>
    </button>
  );
}

type Entry =
  | { kind: "field"; key: string; f: ItemField }
  | { kind: "object"; key: string; o: ObjDesc }
  | { kind: "list"; key: string; l: ListDesc };

const has = (v: any) => v !== undefined && v !== null;

function isPresent(e: Entry, b: any) {
  const v = b?.[e.key];
  if (e.kind === "list") return Array.isArray(v);
  if (e.kind === "object") return has(v) && typeof v === "object";
  return has(v);
}

/**
 * The value a newly added component starts with.
 *
 * Seeded with something visible rather than "". Every template renders a
 * field conditionally (`{b.eyebrow ? <span>…</span> : null}`), so an empty
 * string adds the field to this editor and changes nothing at all on the
 * preview — which reads as "Add component did nothing". A list has always
 * started with one item for exactly this reason; fields and objects now do
 * the same. The placeholder is the field's own key, so it says what it is and
 * is immediately typed over.
 */
export function seedField(f: ItemField): any {
  if (f.select) return f.select[0];
  // A real symbol id: an empty one renders an invisible <use href="#">.
  if (f.icon) return "i-check";
  // A link with no target is a dead anchor; "#" keeps it inert but visible.
  if (/^(href|url|link)$/i.test(f.k) || /Href$/.test(f.k)) return "#";
  return f.k;
}

function emptyOf(e: Entry, b: any): any {
  if (e.kind === "field") return seedField(e.f);
  if (e.kind === "object") return Object.fromEntries(e.o.fields.map((f) => [f.k, seedField(f)]));
  // A new list starts with one item so the change is visible in the preview
  // straight away — except a table's rows, which need columns to exist first.
  if (e.l.matrix) return [];
  return [newItem(e.l, b)];
}

function newItem(l: ListDesc, b: any): any {
  if (l.matrix) return ((b?.[l.matrix] as any[]) || []).map(() => "");
  return freshDef(l.def);
}

export default function BlockComponents({
  block, meta, template, customIcons, onIconsChanged, update, arrayAdd, arrayRemove, hidePrimary, sourceSlot,
  device = "desktop", selectedComp, onPickComp, onResetBox, onResetAllBoxes,
}: Ops & {
  block: any; meta: BlockTypeMeta; template?: string; customIcons: CustomIcon[];
  onIconsChanged?: () => void | Promise<void>;
  /** Hide the primary `items` list (a live `source` feed overwrites it). */
  hidePrimary?: boolean;
  /** Rendered just before the lists (the live-data binding control). */
  sourceSlot?: ReactNode;
  /** Figma-style layout (b.boxes) — the device being edited, the component
   * picked on the preview, and the reset actions. All optional: without
   * them this is the plain content editor. */
  device?: string;
  selectedComp?: string | null;
  onPickComp?: (key: string | null) => void;
  onResetBox?: (key: string) => void;
  onResetAllBoxes?: () => void;
}) {
  const { t } = useLang();
  const moved: Record<string, any> = (block?.boxes?.[device] && typeof block.boxes[device] === "object") ? block.boxes[device] : {};
  const ctx: Ctx = { block, template, customIcons, onIconsChanged, t, update, arrayAdd, arrayRemove, moved, selectedComp: selectedComp ?? null, onPickComp, onResetBox };
  const rootRef = useRef<HTMLDivElement>(null);
  // Picked on the preview → bring its field into view in the sidebar.
  useEffect(() => {
    if (!selectedComp) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-comp="${selectedComp.replace(/["\\]/g, "")}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedComp]);
  const movedKeys = Object.keys(moved);
  const lists = listsOf(meta).filter((l) => applies(l, block, template) && !(hidePrimary && l === meta.items));
  const entries: Entry[] = [
    ...(meta.fields || []).filter((f) => applies(f, block, template)).map((f) => ({ kind: "field" as const, key: f.k, f })),
    ...(meta.objects || []).filter((o) => applies(o, block, template)).map((o) => ({ kind: "object" as const, key: o.key, o })),
    ...lists.map((l) => ({ kind: "list" as const, key: l.key, l })),
  ];
  const present = entries.filter((e) => isPresent(e, block));
  const absent = entries.filter((e) => !isPresent(e, block));
  const remove = (key: string) => update([key], undefined);
  const presentScalars = present.filter((e) => e.kind !== "list");
  const presentLists = present.filter((e) => e.kind === "list");

  return (
    <div className="bc" ref={rootRef}>
      {onPickComp && (
        <div className="bc-layout">
          <Icon name="layout" />
          <span>{movedKeys.length
            ? t("vb.comp.layout.moved").replace("{n}", String(movedKeys.length)).replace("{d}", device)
            : t("vb.comp.layout.hint").replace("{d}", device)}</span>
          {movedKeys.length > 0 && onResetAllBoxes && (
            <button type="button" className="bc-chip" onClick={onResetAllBoxes}>↺ {t("vb.comp.layout.resetall")}</button>
          )}
        </div>
      )}
      {present.length === 0 && <div className="muted bc-none">{t("vb.comp.none")}</div>}
      {presentScalars.map((e) => (
        <div className={"fld bc-fld" + (selectedComp === e.key ? " bc-sel" : "")} key={e.key} data-comp={e.key}>
          <div className="bc-lbl">
            <label className="bc-pick" onClick={() => onPickComp?.(selectedComp === e.key ? null : e.key)}>{e.key}</label>
            <MovedChip k={e.key} ctx={ctx} />
            {!(e.kind === "field" && e.f.keep) && <RemoveBtn onClick={() => remove(e.key)} title={t("vb.comp.remove")} />}
          </div>
          {e.kind === "field"
            ? <FieldInput f={e.f} value={block[e.key]} onChange={(v) => update([e.key], v)} ctx={ctx} />
            : <ObjectFields o={e.o} path={[e.key]} value={block[e.key]} ctx={ctx} />}
        </div>
      ))}
      {sourceSlot}
      {presentLists.map((e) => e.kind === "list" && (
        <ListEditor key={e.key} l={e.l} path={[e.key]} value={block[e.key]} ctx={ctx} onRemove={() => remove(e.key)} />
      ))}
      {absent.length > 0 && <AddMenu entries={absent} t={t} onPick={(e) => update([e.key], emptyOf(e, block))} />}
    </div>
  );
}

const KIND_ICON: Record<string, string> = { text: "doc", long: "menu", select: "layout", icon: "star", object: "card", list: "grid" };
function kindOf(e: Entry): string {
  if (e.kind === "list") return "list";
  if (e.kind === "object") return "object";
  return e.f.icon ? "icon" : e.f.select ? "select" : e.f.ta ? "long" : "text";
}

// The "+ Add component" picker — a themed popover rather than a native
// <select>, grouped so single fields, grouped fields and repeatable lists
// read as different things at a glance.
function AddMenu({ entries, onPick, t }: { entries: Entry[]; onPick: (e: Entry) => void; t: (k: string) => string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => { if (!ref.current?.contains(ev.target as Node)) setOpen(false); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);
  const groups = [
    { key: "fields", label: t("vb.comp.g.fields"), items: entries.filter((e) => e.kind === "field") },
    { key: "objects", label: t("vb.comp.g.objects"), items: entries.filter((e) => e.kind === "object") },
    { key: "lists", label: t("vb.comp.g.lists"), items: entries.filter((e) => e.kind === "list") },
  ].filter((g) => g.items.length);
  return (
    <div className="bc-addwrap" ref={ref}>
      <button type="button" className={"bc-addbtn" + (open ? " on" : "")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="bc-addic"><Icon name="plus" /></span>
        <span>{t("vb.comp.add")}</span>
        <span className="bc-addn mono">{entries.length}</span>
      </button>
      {open && (
        <div className="bc-menu" role="menu">
          {groups.map((g) => (
            <div key={g.key} className="bc-menu-g">
              <div className="bc-menu-h">{g.label}</div>
              {g.items.map((e) => (
                <button key={e.key} type="button" role="menuitem" className="bc-menu-i" onClick={() => { onPick(e); setOpen(false); }}>
                  <span className="bc-menu-ic"><Icon name={KIND_ICON[kindOf(e)]} /></span>
                  <span className="bc-menu-k">{e.key}</span>
                  <span className="bc-menu-t">{t("vb.comp.k." + kindOf(e))}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RemoveBtn({ onClick, title }: { onClick: () => void; title: string }) {
  return <button type="button" className="bc-x" aria-label={title} title={title} onClick={onClick}><Icon name="close" /></button>;
}

function FieldInput({ f, value, onChange, ctx, placeholder }: { f: ItemField; value: any; onChange: (v: any) => void; ctx: Ctx; placeholder?: string }) {
  const v = value ?? "";
  if (f.icon) return <IconPicker value={v || "i-check"} builtIn={FEATURE_ICONS} customIcons={ctx.customIcons} onLibraryChanged={ctx.onIconsChanged} title="icon" onChange={onChange} />;
  if (f.select) {
    return (
      <select value={String(v)} onChange={(e) => onChange(e.target.value)}>
        {f.select.map((opt) => <option key={opt} value={opt}>{placeholder ? f.k + (opt ? ": " + opt : "") : opt || "—"}</option>)}
      </select>
    );
  }
  if (f.ta) return <textarea placeholder={placeholder} value={v} onChange={(e) => onChange(e.target.value)} style={{ minHeight: placeholder ? 44 : 54 }} />;
  return <input placeholder={placeholder} value={v} onChange={(e) => onChange(e.target.value)} />;
}

function ObjectFields({ o, path, value, ctx }: { o: ObjDesc; path: Path; value: any; ctx: Ctx }) {
  return (
    <div className="bc-obj">
      {o.fields.filter((f) => applies(f, ctx.block, ctx.template)).map((f) => (
        <FieldInput key={f.k} f={f} placeholder={f.k} value={value?.[f.k]} onChange={(v) => ctx.update([...path, f.k], v)} ctx={ctx} />
      ))}
    </div>
  );
}

// First non-empty text of an item — the collapsed row's summary.
function summaryOf(it: any, l: ListDesc): string {
  if (typeof it === "string") return it;
  if (Array.isArray(it)) return it.filter(Boolean).join(" · ");
  for (const f of l.fields || []) if (!f.icon && typeof it?.[f.k] === "string" && it[f.k].trim()) return it[f.k];
  return "";
}

function ListEditor({ l, path, value, ctx, onRemove }: { l: ListDesc; path: Path; value: any; ctx: Ctx; onRemove?: () => void }) {
  const items: any[] = Array.isArray(value) ? value : [];
  // Items that hold their own nested lists (tabs) start collapsed — a tab's
  // whole subtree open at once is a wall of inputs.
  const nested = !!(l.lists?.length || l.objects?.length);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const isOpen = (k: number) => open[k] ?? !nested;
  const cols: any[] = l.matrix ? (getAt(ctx.block, [...path.slice(0, -1), l.matrix]) || []) : [];

  function move(k: number, d: number) {
    const j = k + d;
    if (j < 0 || j >= items.length) return;
    const n = items.slice();
    [n[k], n[j]] = [n[j], n[k]];
    ctx.update(path, n);
    setOpen((o) => ({ ...o, [k]: isOpen(j), [j]: isOpen(k) }));
  }

  // Only a TOP-level list and its items are preview components (renderers
  // tag "items" / "items.2" — see public-site/templates/_builder/boxes.ts).
  const compKey = path.length === 1 ? String(path[0]) : null;
  const itemKey = (k: number) => (compKey ? compKey + "." + k : null);
  // An item picked on the preview opens in the sidebar.
  const selItem = compKey && ctx.selectedComp?.startsWith(compKey + ".") ? Number(ctx.selectedComp.slice(compKey.length + 1)) : -1;
  useEffect(() => { if (selItem >= 0) setOpen((o) => (o[selItem] ? o : { ...o, [selItem]: true })); }, [selItem]);

  return (
    <div className={"fld bc-list" + (compKey && ctx.selectedComp === compKey ? " bc-sel" : "")} data-comp={compKey ?? undefined}>
      <div className="bc-lbl">
        <label className={compKey ? "bc-pick" : undefined} onClick={() => compKey && ctx.onPickComp?.(ctx.selectedComp === compKey ? null : compKey)}>
          {String(path[path.length - 1])} <span className="mono bc-count">{items.length}</span>
        </label>
        {compKey && <MovedChip k={compKey} ctx={ctx} />}
        {onRemove && <RemoveBtn onClick={onRemove} title={ctx.t("vb.comp.remove")} />}
      </div>
      {items.length === 0 && <div className="muted bc-none">{ctx.t("vb.comp.empty")}</div>}
      {items.map((it, k) => (
        <div className={"bc-item" + (k === selItem ? " bc-sel" : "")} key={k} data-comp={itemKey(k) ?? undefined}>
          <div className="bc-item-h">
            <button type="button" className="bc-tog" onClick={() => setOpen((o) => ({ ...o, [k]: !isOpen(k) }))} aria-expanded={isOpen(k)}>
              <Icon name={isOpen(k) ? "chevron-down" : "chevron"} />
              <span className="mono">{k + 1}</span>
              <span className="bc-sum">{summaryOf(it, l)}</span>
            </button>
            {itemKey(k) && <MovedChip k={itemKey(k)!} ctx={ctx} />}
            <button type="button" className="bc-mini" aria-label={ctx.t("a11y.moveup")} title={ctx.t("a11y.moveup")} disabled={k === 0} onClick={() => move(k, -1)}>↑</button>
            <button type="button" className="bc-mini" aria-label={ctx.t("a11y.movedown")} title={ctx.t("a11y.movedown")} disabled={k === items.length - 1} onClick={() => move(k, 1)}>↓</button>
            <button type="button" className="bc-mini" aria-label={ctx.t("a11y.delete")} title={ctx.t("a11y.delete")} onClick={() => ctx.arrayRemove(path, k)}><Icon name="trash" /></button>
          </div>
          {isOpen(k) && (
            <div className="bc-item-b">
              {l.scalar ? (
                <input value={it ?? ""} onChange={(e) => ctx.update([...path, k], e.target.value)} />
              ) : l.matrix ? (
                cols.length === 0
                  ? <div className="muted bc-none">{ctx.t("vb.comp.nocols")}</div>
                  : Array.from({ length: Math.max(cols.length, Array.isArray(it) ? it.length : 0) }, (_, c) => (
                      <input key={c} placeholder={String(cols[c] ?? c + 1)} value={(Array.isArray(it) ? it[c] : "") ?? ""}
                        onChange={(e) => ctx.update([...path, k, c], e.target.value)} />
                    ))
              ) : (
                <>
                  {(l.fields || []).filter((f) => applies(f, ctx.block, ctx.template)).map((f) => (
                    <FieldInput key={f.k} f={f} placeholder={f.k} value={it?.[f.k]} onChange={(v) => ctx.update([...path, k, f.k], v)} ctx={ctx} />
                  ))}
                  {(l.objects || []).filter((o) => applies(o, ctx.block, ctx.template)).map((o) => (
                    <div key={o.key} className="bc-sub">
                      <label>{o.key}</label>
                      <ObjectFields o={o} path={[...path, k, o.key]} value={it?.[o.key]} ctx={ctx} />
                    </div>
                  ))}
                  {(l.lists || []).filter((sl) => applies(sl, ctx.block, ctx.template)).map((sl) => (
                    <div key={sl.key} className="bc-sub">
                      <ListEditor l={sl} path={[...path, k, sl.key]} value={it?.[sl.key]} ctx={ctx} />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      ))}
      <button type="button" className="vb-add-btn" disabled={!!l.matrix && cols.length === 0}
        onClick={() => { ctx.arrayAdd(path, newItem(l, getAt(ctx.block, path.slice(0, -1)))); setOpen((o) => ({ ...o, [items.length]: true })); }}>
        <Icon name="plus" />{ctx.t("vb.comp.additem")} {String(path[path.length - 1])}
      </button>
    </div>
  );
}

function getAt(obj: any, path: Path): any {
  return path.reduce((o: any, k) => (o == null ? undefined : o[k]), obj);
}
