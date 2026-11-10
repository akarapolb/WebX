"use client";
// The Layers panel (Figma / Photoshop style): the whole page as a tree. Every block is a top row — drag it to move
// it, double-click its name to rename it, lock it, hide it. The selected block opens into its parts (as the preview
// reports them), and each part can be renamed, locked, hidden, and picked; Shift or Ctrl/Cmd-click picks several at
// once, so one style change reaches them all.
//
// Hiding (the eye) is for editing only: never saved, never on the real page. Locking and names ARE saved with the
// block (`__locks`, `__names`), like in Figma: a locked layer cannot be picked or dragged in the preview, so it does
// not get moved by accident. The background layer opens the section's style (colour, picture, gradient, overlay).
import { useState } from "react";
import Icon from "./Icon";

export type Layer = { kind: "comp" | "layer" | "bg"; key: string; depth: number };

/** "<block>|<kind>|<key>": the id a hidden layer is kept under (and the form the preview expects). */
export const layerId = (i: number, l: Pick<Layer, "kind" | "key">) => `${i}|${l.kind}|${l.key}`;

/** A layer's name for people: its own name if someone gave it one, else "Item 3 · icon", "Hero picture", "Background". */
export function layerName(l: Pick<Layer, "kind" | "key">, t: (k: string) => string, names?: Record<string, string>): string {
  const own = names?.[l.kind === "comp" ? l.key : l.kind + ":" + l.key];
  if (typeof own === "string" && own.trim()) return own;
  if (l.kind === "bg") return t("ly.bg");
  if (l.kind === "layer") return t("ly.l." + l.key) !== "ly.l." + l.key ? t("ly.l." + l.key) : l.key;
  if (l.key === "section") return t("ly.section");
  const part = /^item(Title|Body|Icon|Tag|Meta)\.(\d+)$/.exec(l.key);
  if (part) return t("ly.item") + " " + (Number(part[2]) + 1) + " · " + t("ly.p." + part[1].toLowerCase());
  const item = /^([A-Za-z]+)\.(\d+)$/.exec(l.key);
  if (item) return (item[1] === "items" ? t("ly.item") : item[1]) + " " + (Number(item[2]) + 1);
  if (l.key === "href") return "Hyperlink";
  return l.key;
}
/** Where a layer's own name is kept in the block's `__names`. */
export const nameKey = (l: Pick<Layer, "kind" | "key">) => (l.kind === "comp" ? l.key : l.kind + ":" + l.key);
/** The key a lock is kept under in the block's `__locks`: a part's key, or "section" for the whole block. */
export const lockKey = (l: Pick<Layer, "kind" | "key">) => (l.kind === "comp" ? l.key : "layer:" + l.key);

const ICON: Record<string, string> = { section: "layout", background: "palette", photo: "img", slides: "img", shade: "drop" };

type BlockRow = { name: string; icon: string; locks: string[]; names: Record<string, string> };

export default function LayersPanel({ blocks, active, layers, hidden, selected, onSelectBlock, onReorder, onToggle, onShowAll, onPick, onLock, onRename, t }: {
  blocks: BlockRow[];
  active: number;
  /** The active block's own layers, as the preview reports them. */
  layers: Layer[];
  hidden: string[];
  /** The parts picked in the active block (the first is the main one). */
  selected: string[];
  onSelectBlock: (i: number) => void;
  onReorder: (from: number, to: number) => void;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  /** Pick a part; `add` keeps what is already picked (Shift / Ctrl / Cmd). The section's own layers pick the section. */
  onPick: (key: string, kind: Layer["kind"], add: boolean) => void;
  onLock: (i: number, key: string) => void;
  /** A new name for a block (`key` null) or one of its layers ("" clears it). */
  onRename: (i: number, key: string | null, name: string) => void;
  t: (k: string) => string;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const isHidden = (i: number, l: Pick<Layer, "kind" | "key">) => hidden.includes(layerId(i, l));
  const row = active >= 0 ? blocks[active] : undefined;
  // A layer inside a hidden or locked one is hidden / locked too: show it dimmed.
  const under: { hidden: boolean; locked: boolean }[] = [];
  const stack: { depth: number; hidden: boolean; locked: boolean }[] = [];
  for (const l of layers) {
    while (stack.length && stack[stack.length - 1].depth >= l.depth) stack.pop();
    const ph = stack.some((s) => s.hidden), pl = stack.some((s) => s.locked);
    under.push({ hidden: ph, locked: pl });
    stack.push({ depth: l.depth, hidden: ph || isHidden(active, l), locked: pl || !!row?.locks.includes(lockKey(l)) });
  }
  const nameInput = (id: string, value: string, done: (v: string) => void) => (
    <input className="ly-rename" autoFocus defaultValue={value} maxLength={80} data-testid="layer-rename-input"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }}
      onBlur={(e) => { if (editing === id) done(e.currentTarget.value); setEditing(null); }} />
  );
  const eye = (i: number, l: Pick<Layer, "kind" | "key">, label: string, testid: string) => {
    const off = isHidden(i, l);
    return (
      <button type="button" className={"ly-eye" + (off ? " is-off" : "")} onClick={(e) => { e.stopPropagation(); onToggle(layerId(i, l)); }}
        aria-pressed={off} aria-label={(off ? t("ly.show") : t("ly.hide")) + ": " + label} title={off ? t("ly.show") : t("ly.hide")} data-testid={testid}>
        <Icon name="eye" />
      </button>
    );
  };
  const lock = (i: number, key: string, locked: boolean, label: string, testid: string) => (
    <button type="button" className={"ly-lock" + (locked ? " is-on" : "")} onClick={(e) => { e.stopPropagation(); onLock(i, key); }}
      aria-pressed={locked} aria-label={(locked ? t("ly.unlock") : t("ly.lock")) + ": " + label} title={locked ? t("ly.unlock") : t("ly.lock")} data-testid={testid}>
      <Icon name="lock" />
    </button>
  );

  return (
    <div className="ly" data-testid="layers-panel">
      <div className="ly-h">
        <b>{t("ly.title")}</b>
        <small className="muted">{t("ly.hint")}</small>
        {hidden.length > 0 && <button type="button" className="ly-all" onClick={onShowAll} data-testid="layers-show-all">{t("ly.showAll")}</button>}
      </div>
      <ul className="ly-list ly-tree">
        {blocks.map((b, i) => {
          const secLocked = b.locks.includes("section");
          const isActive = i === active;
          const bid = "b:" + i;
          return (
            <li key={i} className="ly-blk">
              <div className={"ly-row ly-blkrow" + (isActive ? " sel" : "") + (isHidden(i, { kind: "comp", key: "section" }) ? " off" : "") + (over === i && drag !== null && drag !== i ? (drag < i ? " drop-after" : " drop-before") : "")}
                draggable={editing !== bid}
                onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                onDragOver={(e) => { if (drag === null) return; e.preventDefault(); setOver(i); }}
                onDragLeave={() => setOver((o) => (o === i ? null : o))}
                onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) onReorder(drag, i); setDrag(null); setOver(null); }}
                onDragEnd={() => { setDrag(null); setOver(null); }}
                data-testid={"layer-block-" + i}>
                <span className="ly-grip" aria-hidden="true"><Icon name="drag" /></span>
                <button type="button" className="ly-name" onClick={() => onSelectBlock(i)} onDoubleClick={() => setEditing(bid)} title={t("ly.renameHint")}>
                  <Icon name={b.icon} />
                  {editing === bid ? nameInput(bid, b.name, (v) => onRename(i, null, v)) : <span>{b.name}</span>}
                </button>
                {lock(i, "section", secLocked, b.name, "layer-lock-block-" + i)}
                {eye(i, { kind: "comp", key: "section" }, b.name, "layer-eye-block-" + i)}
              </div>
              {isActive && (
                <ul className="ly-list ly-sub">
                  {layers.length === 0 && <li className="muted" style={{ fontSize: 12, padding: "6px 8px" }}>{t("ly.none")}</li>}
                  {layers.filter((l) => !(l.kind === "comp" && l.key === "section")).map((l, n) => {
                    const idx = layers.indexOf(l);
                    const name = layerName(l, t, b.names);
                    const pickKey = l.kind === "comp" ? l.key : "section";
                    const sel = l.kind === "comp" && selected.includes(l.key);
                    const locked = b.locks.includes(lockKey(l));
                    const id = "l:" + i + ":" + nameKey(l);
                    return (
                      <li key={l.kind + ":" + l.key + ":" + n}
                        className={"ly-row" + (sel ? " sel" : "") + (isHidden(i, l) || under[idx]?.hidden ? " off" : "") + (locked || under[idx]?.locked || secLocked ? " locked" : "")}
                        style={{ paddingLeft: 4 + Math.max(0, l.depth - 1) * 14 }} data-testid={"layer-" + l.kind + "-" + l.key}>
                        <button type="button" className="ly-name"
                          onClick={(e) => onPick(pickKey, l.kind, e.shiftKey || e.ctrlKey || e.metaKey)}
                          onDoubleClick={() => setEditing(id)}
                          title={l.kind === "bg" ? t("ly.bgHint") : t("ly.renameHint")}>
                          <Icon name={ICON[l.key] || (l.kind === "layer" ? "img" : /^itemIcon\./.test(l.key) ? "star" : "grid")} />
                          {editing === id ? nameInput(id, name, (v) => onRename(i, nameKey(l), v)) : <span>{name}</span>}
                          {l.kind === "bg" && editing !== id && <em>{t("ly.customize")}</em>}
                        </button>
                        {l.kind !== "bg" && lock(i, lockKey(l), locked, name, "layer-lock-" + l.kind + "-" + l.key)}
                        {eye(i, l, name, "layer-eye-" + l.kind + "-" + l.key)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {selected.length > 1 && <div className="ly-multi" data-testid="layers-multi">{t("ly.multi").replace("{n}", String(selected.length))}</div>}
    </div>
  );
}
