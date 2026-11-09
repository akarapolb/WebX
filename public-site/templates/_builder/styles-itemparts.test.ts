// A card's title, text, icon, tag and meta are components of their own (itemTitle.0, itemBody.0, …).
// A colour on the whole card or list must still reach the parts that have no style of their own.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss } from "./styles";

const rules = (css: string) => css.split("}").filter(Boolean).map((r) => r + "}");
const S = '[data-vb-s="1"]';

describe("item parts as components of their own", () => {
  test("a card's colour reaches its title, text, icon, tag and meta", () => {
    const css = stylesCss({ styles: { "items.0": { color: "#ff0000" } } }, 1);
    for (const part of ["itemTitle.", "itemBody.", "itemIcon.", "itemTag.", "itemMeta."]) {
      assert.match(css, new RegExp(`\\[data-vb-c="items\\.0"\\] \\[data-vb-c\\^="${part.replace(".", "\\.")}"\\]`));
    }
  });
  test("a part with a style of its own is left out of the card's rule, and keeps its own colour", () => {
    const css = stylesCss({ styles: { "items.0": { color: "#ff0000" }, "itemTitle.0": { color: "#00ff00" } } }, 1);
    assert.match(css, /\[data-vb-c\^="itemBody\."\]:not\(\[data-vb-c="itemTitle\.0"\]\)/);
    assert.match(css, new RegExp(`\\${S.slice(0, -1)}\\]\\[data-vb-c="itemTitle\\.0"\\]\\{color:#00ff00!important\\}`));
  });
  test("a part's own rule does not spread to the other parts", () => {
    const css = stylesCss({ styles: { "itemTitle.0": { color: "#00ff00" } } }, 1);
    assert.doesNotMatch(css, /\[data-vb-c\^="item(Body|Icon|Tag|Meta)\."\]/);
  });
  test("every selector still starts with the block's own scope", () => {
    const css = stylesCss({ styles: { "items.0": { color: "#ff0000" }, "itemTitle.0": { color: "#00ff00" }, heading: { color: "#0000ff" } } }, 1);
    for (const r of rules(css)) for (const sel of r.slice(0, r.indexOf("{")).split(",")) assert.ok(sel.startsWith(S), sel);
  });
  test("no item parts, no extra rules", () => {
    const css = stylesCss({ styles: { heading: { color: "#0000ff" } } }, 1);
    assert.doesNotMatch(css, /data-vb-c\^=/);
  });
});
