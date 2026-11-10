import { test } from "node:test";
import assert from "node:assert/strict";
import { boxesCss } from "./boxes";

test("one size for every item of a list, and an item's own size still wins", () => {
  const css = boxesCss({ boxes: { desktop: { "items.2": { w: 120 }, "items.*": { w: 260, h: 180, x: 50 } } } }, 3);
  const all = css.indexOf('[data-vb-s="3"][data-vb-c^="items."]{width:260px!important');
  const own = css.indexOf('[data-vb-s="3"][data-vb-c="items.2"]{width:120px!important');
  assert.ok(all >= 0 && own > all, css);
  assert.match(css, /height:180px!important/);
  assert.doesNotMatch(css.slice(all, own), /translate/); // size only for every item: each keeps its own place
});
test("a key that is not a list's every-item key writes nothing", () => {
  for (const k of ["items.**", "*", "a b.*", 'items."]{}.*']) assert.equal(boxesCss({ boxes: { desktop: { [k]: { w: 100 } } } }, 0), "", k);
});
