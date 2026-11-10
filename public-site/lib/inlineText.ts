// Formatting inside a line of text: a word in bold, a phrase in a theme colour, a link on a few words. Editors set it
// in the Visual Builder; it is stored in the text field as a tiny, fixed set of tags:
//
//   <b> <i> <u> <s> <br> <a href="…"> <span data-c="@primary | #rrggbb">
//
// Nothing here is ever handed to the browser as HTML. The text is read tag by tag and turned into React elements;
// any other tag, any attribute other than those two, and any tag left open or closed out of turn is shown as the
// plain text it is. Links still go through safeLink, colours through the same check the style panel uses. Addresses
// typed as plain text keep becoming links (autolink), except inside a link of their own.
import { createElement, Fragment, type ReactNode } from "react";
import { safeLink } from "./linkUrl";
import { autolink } from "./autolink";
import { colorCss } from "@/templates/_builder/styles";

type Tag = "b" | "i" | "u" | "s" | "a" | "span";
export type InlineNode = string | { tag: Tag; href?: string; color?: string; children: InlineNode[] } | { tag: "br" };

const TOKEN = /<(\/?)(b|strong|i|em|u|s|a|span|br)((?:\s+[a-z-]+="[^"<>]*")*)\s*(\/?)>/gi;
const NORMAL: Record<string, Tag | "br"> = { b: "b", strong: "b", i: "i", em: "i", u: "u", s: "s", a: "a", span: "span", br: "br" };
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]);
const attr = (attrs: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`, "i").exec(attrs)?.[1];

/** True when the text carries any of the formatting tags (plain text is rendered the quick way). */
export const hasMarkup = (s: unknown): s is string => typeof s === "string" && /<\/?(?:b|strong|i|em|u|s|a|span|br)\b/i.test(s);

/** The text as a tree of formatted pieces. Never throws: what does not parse cleanly stays text. */
export function parseInline(text: string): InlineNode[] {
  const root: InlineNode[] = [];
  const stack: { tag: Tag; node: Extract<InlineNode, { children: InlineNode[] }>; raw: string; parent: InlineNode[] }[] = [];
  let cur = root;
  let last = 0;
  const pushText = (s: string) => { if (s) cur.push(decode(s)); };
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    pushText(text.slice(last, at));
    last = at + m[0].length;
    const closing = m[1] === "/", name = NORMAL[m[2].toLowerCase()];
    if (name === "br") { if (!closing) cur.push({ tag: "br" }); continue; }
    if (!closing) {
      if (stack.length >= 8) { pushText(m[0]); continue; } // deeper than anyone formats a line: keep it as text
      const node: Extract<InlineNode, { children: InlineNode[] }> = { tag: name, children: [] };
      if (name === "a") {
        const href = safeLink(decode(attr(m[3], "href") || ""));
        if (!href || stack.some((s) => s.tag === "a")) { pushText(m[0]); continue; }
        node.href = href;
      }
      if (name === "span") {
        const c = attr(m[3], "data-c");
        if (!c || !colorCss(c)) { pushText(m[0]); continue; }
        node.color = c;
      }
      cur.push(node);
      stack.push({ tag: name, node, raw: m[0], parent: cur });
      cur = node.children;
      continue;
    }
    // A closing tag only closes the innermost open tag of the same kind; anything else is text.
    if (stack.length && stack[stack.length - 1].tag === name) { stack.pop(); cur = stack.length ? stack[stack.length - 1].node.children : root; }
    else pushText(m[0]);
  }
  pushText(text.slice(last));
  // Tags left open: their content stays formatted (as typed), which is what an editor expects to see.
  return root;
}

/** The text with its formatting, as React elements. `links: false` drops the links (inside a card that is a link). */
export function inline(text: unknown, opts: { links?: boolean } = {}): ReactNode {
  if (typeof text !== "string" || !text) return text as ReactNode;
  const links = opts.links !== false;
  if (!hasMarkup(text)) return links ? autolink(text) : text;
  const render = (nodes: InlineNode[], inLink: boolean, key: string): ReactNode[] => nodes.map((n, i) => {
    const k = key + "." + i;
    if (typeof n === "string") return createElement(Fragment, { key: k }, links && !inLink ? autolink(n) : n);
    if (n.tag === "br") return createElement("br", { key: k });
    const kids = render(n.children, inLink || n.tag === "a", k);
    if (n.tag === "a") return links ? createElement("a", { key: k, href: n.href, className: "block-autolink", rel: "noopener noreferrer" }, ...kids) : createElement(Fragment, { key: k }, ...kids);
    if (n.tag === "span") return createElement("span", { key: k, style: { color: colorCss(n.color) } }, ...kids);
    // A template may colour its own <strong>/<em> (a notice's title, a card's label). A word an editor made bold keeps
    // the colour of the text around it — or of the colour they gave it.
    const el = n.tag === "b" ? "strong" : n.tag === "i" ? "em" : n.tag;
    return createElement(el, { key: k, ...(el === "strong" || el === "em" ? { style: { color: "inherit" } } : {}) }, ...kids);
  });
  return createElement(Fragment, null, ...render(parseInline(text), false, "r"));
}

/** The words alone, for places that cannot hold formatting (a page title, an aria-label, a file name). */
export function plainText(text: unknown): string {
  if (typeof text !== "string") return "";
  if (!hasMarkup(text)) return text;
  const flat = (nodes: InlineNode[]): string => nodes.map((n) => (typeof n === "string" ? n : n.tag === "br" ? " " : flat(n.children))).join("");
  return flat(parseInline(text));
}
