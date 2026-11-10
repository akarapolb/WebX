// The Studio side of formatting inside a line of text (public-site/lib/inlineText.ts renders it). A text field stores
// a tiny fixed set of tags — <b> <i> <u> <s> <br> <a href> <span data-c> — and nothing else:
//   toEditorHtml(value)  the stored text → HTML for the editable field (only those tags; everything else escaped)
//   serialize(root)      what the person typed and formatted → the stored text (only those tags, links and colours checked)
// so whatever the browser's editing puts in the field (<font>, <div>, styles, pasted markup) never reaches the page.

export const RICH_FIELD_KEYS = new Set(["heading", "subheading", "eyebrow", "kicker", "lead", "intro", "introLead", "introHeading", "formHeading", "panelHeading", "body"]);

const COLOUR = /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|@(?:primary|accent|ground|ink|c[1-8]))$/;
const TOKEN = /<(\/?)(b|strong|i|em|u|s|a|span|br)((?:\s+[a-z-]+="[^"<>]*")*)\s*(\/?)>/gi;
const NORMAL: Record<string, string> = { b: "b", strong: "b", i: "i", em: "i", u: "u", s: "s", a: "a", span: "span", br: "br" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attr = (attrs: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`, "i").exec(attrs)?.[1];
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " } as Record<string, string>)[e]);

/** The same rule as public-site's safeLink: http(s), mailto:, tel:, a path or an anchor on this site. */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 2000 || /[\s\u0000-\u001f\u007f<>"'`\\]/.test(s)) return null;
  if (/^https?:\/\/[^/?#]+/i.test(s) || /^(mailto|tel):./i.test(s) || s.startsWith("#") || (s.startsWith("/") && !s.startsWith("//"))) return s;
  return null;
}
export const isColour = (c: unknown): c is string => typeof c === "string" && COLOUR.test(c);

/** The stored text as the editable field's HTML. `swatch` gives a theme colour's look (e.g. "@primary" → "#1a73e8"). */
export function toEditorHtml(value: unknown, swatch: (c: string) => string | undefined = () => undefined): string {
  if (typeof value !== "string" || !value) return "";
  let out = "";
  let last = 0;
  const open: string[] = [];
  for (const m of value.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    out += esc(decode(value.slice(last, at)));
    last = at + m[0].length;
    const closing = m[1] === "/", tag = NORMAL[m[2].toLowerCase()];
    if (tag === "br") { if (!closing) out += "<br>"; continue; }
    if (!closing) {
      if (tag === "a") {
        const href = safeHref(decode(attr(m[3], "href") || ""));
        if (!href || open.includes("a")) { out += esc(m[0]); continue; }
        out += `<a href="${esc(href)}">`;
      } else if (tag === "span") {
        const c = attr(m[3], "data-c");
        if (!isColour(c)) { out += esc(m[0]); continue; }
        const look = c.startsWith("@") ? swatch(c) : c;
        out += `<span data-c="${esc(c)}"${look && isLook(look) ? ` style="color:${look}"` : ""}>`;
      } else out += `<${tag}>`;
      open.push(tag);
      continue;
    }
    if (open.length && open[open.length - 1] === tag) { open.pop(); out += `</${tag}>`; }
    else out += esc(m[0]);
  }
  out += esc(decode(value.slice(last)));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}
const isLook = (v: string) => /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d.,\s%]+\)$/.test(v);

/** "rgb(204, 0, 0)" → "#cc0000"; a hex stays as it is. */
function hexOf(css: string): string | null {
  const v = css.trim();
  if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  const m = /^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})/.exec(v);
  return m ? "#" + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("") : null;
}

/** What is in the editable field, as the stored text: only the allowed tags, in a tidy form. */
export function serialize(root: Node, multiline = true): string {
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return esc((n.textContent || "").replace(/ /g, " "));
    if (n.nodeType !== 1) return "";
    const el = n as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(walk).join("");
    if (tag === "br") return multiline ? "<br>" : " ";
    if (!inner) return "";
    const style = el.getAttribute("style") || "";
    let out = inner;
    // Formatting the browser may write as a style instead of a tag.
    if (/font-weight:\s*(bold|[6-9]00)/i.test(style)) out = `<b>${out}</b>`;
    if (/font-style:\s*italic/i.test(style)) out = `<i>${out}</i>`;
    if (/text-decoration[^;]*underline/i.test(style)) out = `<u>${out}</u>`;
    if (/text-decoration[^;]*line-through/i.test(style)) out = `<s>${out}</s>`;
    if (tag === "b" || tag === "strong") return `<b>${out}</b>`;
    if (tag === "i" || tag === "em") return `<i>${out}</i>`;
    if (tag === "u") return `<u>${out}</u>`;
    if (tag === "s" || tag === "strike" || tag === "del") return `<s>${out}</s>`;
    if (tag === "a") { const href = safeHref(el.getAttribute("href")); return href ? `<a href="${esc(href)}">${out}</a>` : out; }
    if (tag === "span" || tag === "font") {
      const c = el.getAttribute("data-c") || (tag === "font" ? hexOf(el.getAttribute("color") || "") : null) || (/(^|;)\s*color:\s*([^;]+)/i.exec(style) ? hexOf(/(^|;)\s*color:\s*([^;]+)/i.exec(style)![2]) : null);
      return isColour(c) ? `<span data-c="${esc(c)}">${out}</span>` : out;
    }
    // A block the browser made for a new line (<div>, <p>) becomes a line break.
    if (tag === "div" || tag === "p") return (multiline ? "<br>" : " ") + out;
    return out;
  };
  let s = Array.from(root.childNodes).map(walk).join("");
  s = s.replace(/^<br>/, "").replace(/(<br>)+$/, "");
  // Neighbouring tags of the same kind are one: "<b>a</b><b>b</b>" → "<b>ab</b>".
  for (let k = 0; k < 3; k++) s = s.replace(/<\/(b|i|u|s)><\1>/g, "");
  return s;
}

/** The words alone (for a list summary or a search). */
export const stripMarkup = (s: unknown): string => (typeof s === "string" ? decode(s.replace(/<br\s*\/?>/gi, " ").replace(/<\/?(?:b|strong|i|em|u|s|a|span)\b[^>]*>/gi, "")) : "");
