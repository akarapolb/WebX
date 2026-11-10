// Plain text an editor typed ("see https://example.org/form or mail info@orst.go.th") becomes real links on the page,
// without the editor doing anything. Only addresses in the text itself are linked, and every one still goes through
// safeLink, so nothing but http(s), mailto: and tel: can become an <a href>.
import { createElement, Fragment, type ReactNode } from "react";
import { safeLink } from "./linkUrl";

// ASCII only: Thai text written straight after an address ("https://x.org/aแล้ว") must not be swallowed into it.
const FOUND = /(https?:\/\/[^\s<>"'`\\\u0080-￿]+|www\.[^\s<>"'`\\\u0080-￿]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
const TRAILING = /[.,;:!?'"\])}>]+$/;

export type LinkPart = { text: string; href?: string };

/** The address without the punctuation that ends a sentence (or an unmatched closing bracket) after it. */
function trimAddress(s: string): string {
  let out = s;
  for (;;) {
    const before = out;
    out = out.replace(/[.,;:!?'"\]}>]+$/, "");
    if (out.endsWith(")") && (out.match(/\)/g) || []).length > (out.match(/\(/g) || []).length) out = out.slice(0, -1);
    if (out === before) return out;
  }
}

/** Cut a text into plain pieces and linked pieces. Text with no address comes back as one plain piece. */
export function splitLinks(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let last = 0;
  for (const m of text.matchAll(FOUND)) {
    const start = m.index ?? 0;
    const found = trimAddress(m[0]);
    if (!found) continue;
    const href = /^www\./i.test(found) ? "https://" + found : found.includes("@") && !/^https?:/i.test(found) ? "mailto:" + found : found;
    const safe = safeLink(href);
    if (!safe) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: found, href: safe });
    last = start + found.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
}

/** The text with its addresses as links. Anything that is not a string (or has no address) is returned as it is. */
export function autolink(text: unknown): ReactNode {
  if (typeof text !== "string" || !text) return text as ReactNode;
  const parts = splitLinks(text);
  if (parts.length === 1 && !parts[0].href) return text;
  return createElement(Fragment, null, ...parts.map((p, i) => p.href
    ? createElement("a", { key: i, href: p.href, className: "block-autolink", rel: "noopener noreferrer" }, p.text)
    : createElement(Fragment, { key: i }, p.text)));
}
