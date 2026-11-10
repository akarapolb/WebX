// The Layers panel's eye: what the harness hides while editing. Each entry comes from another origin (the Studio), so
// anything that is not exactly "<block>|<kind>|<key>" must produce no CSS at all.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hiddenCss } from "./HarnessBridge";

describe("hiddenCss", () => {
  test("a component, a template layer and a section background", () => {
    const css = hiddenCss(["0|comp|heading", "0|layer|photo", "2|bg|background"]);
    assert.match(css, /\[data-vb-index="0"\] \[data-vb-s="0"\]\[data-vb-c="heading"\]\{visibility:hidden!important\}/);
    assert.match(css, /\[data-vb-index="0"\] \[data-vb-layer="photo"\]\{visibility:hidden!important\}/);
    assert.match(css, /\[data-vb-index="2"\] \[data-vb-s="2"\]\[data-vb-c="section"\]\{background:none!important\}/);
  });
  test("item parts keep their dot", () => {
    assert.match(hiddenCss(["1|comp|itemIcon.3"]), /\[data-vb-c="itemIcon\.3"\]/);
  });
  test("anything that could break out of the selector is dropped", () => {
    for (const bad of ['0|comp|x"]{}body{display:none', "0|comp|</style>", "x|comp|heading", "0|script|x", "0|comp|", 42, null]) {
      assert.equal(hiddenCss([bad]), "", String(bad));
    }
    assert.equal(hiddenCss("0|comp|heading"), "");
  });
});
