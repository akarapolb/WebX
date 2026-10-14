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

describe("per-device overrides in the style model", () => {
  test("the device list matches the one the site renders", async () => {
    const { DEVICES } = await import("../lib/componentStyle");
    assert.deepEqual([...DEVICES], ["tablet", "mobile"]);
  });

  test("an override alone makes the style non-blank; an empty one does not", () => {
    assert.equal(isBlankStyle({ mobile: { opacity: 50 } }), false);
    assert.equal(isBlankStyle({ tablet: { paddingTop: 0 } }), false);
    assert.equal(isBlankStyle({ tablet: {}, mobile: { bg: undefined } }), true);
  });

  test("page swatches include colours set only on a tablet or phone", () => {
    const blocks = [{ styles: { a: { tablet: { bg: "#111111", color: "@primary" }, mobile: { borderColor: "#222222", bgOverlay: "#33333380" } } } }];
    assert.deepEqual(pageColors(blocks), ["#111111", "#222222", "#33333380"]);
  });
});

describe("gradients in the style model", () => {
  test("a gradient colour makes the style non-blank, also inside a state or a device", () => {
    assert.equal(isBlankStyle({ gradFrom: "#111111" }), false);
    assert.equal(isBlankStyle({ hover: { gradTo: "#111111" } }), false);
    assert.equal(isBlankStyle({ mobile: { gradFrom: "#111111" } }), false);
  });

  test("the angle range and types match what the site accepts", async () => {
    const { GRAD_ANGLE, GRAD_TYPES } = await import("../lib/componentStyle");
    assert.deepEqual([GRAD_ANGLE.min, GRAD_ANGLE.max, GRAD_ANGLE.default], [0, 360, 180]);
    assert.deepEqual([...GRAD_TYPES], ["linear", "radial"]);
  });

  test("page swatches include gradient colours, in the style, its states and its devices", () => {
    const blocks = [{ styles: { a: { gradFrom: "#111111", gradTo: "@primary", hover: { gradFrom: "#222222" }, tablet: { gradTo: "#333333" } } } }];
    assert.deepEqual(pageColors(blocks), ["#111111", "#333333", "#222222"]);
  });
});

describe("typography in the style model", () => {
  test("the ranges and choices match what the site accepts", async () => {
    const { STYLE_LIMITS, FONT_FAMILIES, TEXT_TRANSFORMS } = await import("../lib/componentStyle");
    assert.deepEqual([STYLE_LIMITS.lineHeight.min, STYLE_LIMITS.lineHeight.max], [0.8, 3]);
    assert.deepEqual([STYLE_LIMITS.letterSpacing.min, STYLE_LIMITS.letterSpacing.max], [-0.1, 0.5]);
    assert.deepEqual([...FONT_FAMILIES], ["heading", "body", "mono"]);
    assert.deepEqual([...TEXT_TRANSFORMS], ["none", "uppercase", "lowercase", "capitalize"]);
  });

  test("a zero letter spacing is a real value, so the style is not blank", () => {
    assert.equal(isBlankStyle({ letterSpacing: 0 }), false);
    assert.equal(isBlankStyle({ fontFamily: "heading" }), false);
    assert.equal(isBlankStyle({ mobile: { textTransform: "uppercase" } }), false);
  });
});
