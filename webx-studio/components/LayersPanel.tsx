"use client";
// The Layers panel (Figma / Photoshop style) for the selected block: every part of it, nested as on the page, with
// an eye to hide a layer while editing (so what sits under it can be seen and picked). Hiding is never saved and never
// reaches the real page. Clicking a layer picks it in the preview and opens its style; the background layer opens the
// section's style, where its colour, picture, gradient and overlay are set.
import Icon from "./Icon";

export type Layer = { kind: "comp" | "layer" | "bg"; key: string; depth: number };

/** "<block>|<kind>|<key>": the id a hidden layer is kept under (and the form the preview expects). */
export const layerId = (i: number, l: Pick<Layer, "kind" | "key">) => `${i}|${l.kind}|${l.key}`;

/** A layer's name for people: "Item 3 · icon", "Hero picture", "Background". */
export function layerName(l: Pick<Layer, "kind" | "key">, t: (k: string) => string): string {
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

const ICON: Record<string, string> = { section: "layout", background: "palette", photo: "img", slides: "img", shade: "drop" };

export default function LayersPanel({ index, layers, hidden, selected, onToggle, onShowAll, onPick, t }: {
  index: number;
  layers: Layer[];
  hidden: string[];
  /** The component picked in the preview, if any. */
  selected: string | null;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  /** Pick a component; the section (also for its background and template pictures) opens the section's style. */
  onPick: (key: string, kind: Layer["kind"]) => void;
  t: (k: string) => string;
}) {
  const isHidden = (l: Layer) => hidden.includes(layerId(index, l));
  // A layer inside a hidden one is hidden too: show it dimmed.
  const under: boolean[] = [];
  const stack: { depth: number; hidden: boolean }[] = [];
  for (const l of layers) {
    while (stack.length && stack[stack.length - 1].depth >= l.depth) stack.pop();
    const parentHidden = stack.some((s) => s.hidden);
    under.push(parentHidden);
    stack.push({ depth: l.depth, hidden: parentHidden || isHidden(l) });
  }
  const anyHidden = hidden.some((h) => h.startsWith(index + "|"));
  return (
    <div className="ly" data-testid="layers-panel">
      <div className="ly-h">
        <b>{t("ly.title")}</b>
        <small className="muted">{t("ly.hint")}</small>
        {anyHidden && <button type="button" className="ly-all" onClick={onShowAll} data-testid="layers-show-all">{t("ly.showAll")}</button>}
      </div>
      {layers.length === 0 && <div className="muted" style={{ fontSize: 12, padding: "6px 2px" }}>{t("ly.none")}</div>}
      <ul className="ly-list">
        {layers.map((l, n) => {
          const off = isHidden(l);
          const pickKey = l.kind === "comp" ? l.key : "section";
          const sel = l.kind === "comp" ? selected === l.key : false;
          return (
            <li key={l.kind + ":" + l.key + ":" + n} className={"ly-row" + (sel ? " sel" : "") + (off || under[n] ? " off" : "")} style={{ paddingLeft: 6 + l.depth * 14 }} data-testid={"layer-" + l.kind + "-" + l.key}>
              <button type="button" className="ly-name" onClick={() => onPick(pickKey, l.kind)} title={l.kind === "bg" ? t("ly.bgHint") : layerName(l, t)}>
                <Icon name={ICON[l.key] || (l.kind === "layer" ? "img" : /^item(Icon)\./.test(l.key) ? "star" : "grid")} />
                <span>{layerName(l, t)}</span>
                {l.kind === "bg" && <em>{t("ly.customize")}</em>}
              </button>
              <button type="button" className={"ly-eye" + (off ? " is-off" : "")} onClick={() => onToggle(layerId(index, l))}
                aria-pressed={off} aria-label={(off ? t("ly.show") : t("ly.hide")) + ": " + layerName(l, t)} title={off ? t("ly.show") : t("ly.hide")} data-testid={"layer-eye-" + l.kind + "-" + l.key}>
                <Icon name="eye" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
