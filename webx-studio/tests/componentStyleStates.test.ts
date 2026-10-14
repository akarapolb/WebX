import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { STATES, isBlankStyle } from "../lib/componentStyle";
import { pageColors } from "../lib/color";

describe("interaction states in the style model", () => {
  test("the three states match the ones the site renders", () => {
    assert.deepEqual([...STATES], ["hover", "focus", "active"]);
  });

  test("a style with only an empty state is still blank", () => {
    assert.equal(isBlankStyle({ hover: {} }), true);
    assert.equal(isBlankStyle({ hover: { bg: undefined, color: "" } }), true);
  });

  test("a value inside a state makes the style non-blank", () => {
    assert.equal(isBlankStyle({ hover: { bg: "#112233" } }), false);
    assert.equal(isBlankStyle({ active: { opacity: 0 } }), false);
    assert.equal(isBlankStyle({ focus: { shadow: "md" } }), false);
  });

  test("page swatches include colours used in states, and skip tokens", () => {
    const blocks = [{ styles: { a: { hover: { bg: "#111111", color: "@primary" }, focus: { borderColor: "#222222" }, active: { iconColor: "#333333" } } } }];
    assert.deepEqual(pageColors(blocks), ["#111111", "#222222", "#333333"]);
  });
});
