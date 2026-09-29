// Colour maths behind the Visual Builder's picker (lib/color.ts).
//
// The picker's whole contract with the renderer is "whatever comes out of
// here is something public-site/templates/_builder/styles.ts will accept",
// which means #rrggbb or #rrggbbaa and nothing else — so these tests care
// most about the output shape and about round-tripping, not about matching
// some reference implementation digit for digit.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseHex, toHex, rgbToHsv, hsvToRgb, pageColors } from "../lib/color";

describe("parseHex", () => {
  test("reads all four hex lengths", () => {
    assert.deepEqual(parseHex("#fff"), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseHex("#000000"), { r: 0, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseHex("#2F54EB"), { r: 0x2f, g: 0x54, b: 0xeb, a: 1 });
    assert.deepEqual(parseHex("#00000000"), { r: 0, g: 0, b: 0, a: 0 });
  });

  test("accepts a missing # and surrounding space", () => {
    assert.deepEqual(parseHex("  2F54EB "), { r: 0x2f, g: 0x54, b: 0xeb, a: 1 });
  });

  test("the 4-digit form's last nibble is alpha", () => {
    const c = parseHex("#f008")!;
    assert.equal(c.r, 255);
    assert.equal(c.g, 0);
    assert.equal(Math.round(c.a * 255), 0x88);
  });

  test("rejects anything it could not re-render", () => {
    // These are all valid CSS a browser would take; styles.ts would not.
    for (const bad of ["rgb(0,0,0)", "red", "#12345", "#gggggg", "", "   ", "#", null, undefined, 123 as any]) {
      assert.equal(parseHex(bad as any), null, JSON.stringify(bad));
    }
  });
});

describe("toHex", () => {
  test("omits the alpha pair when fully opaque", () => {
    assert.equal(toHex({ r: 47, g: 84, b: 235, a: 1 }), "#2f54eb");
  });

  test("appends it when not", () => {
    assert.equal(toHex({ r: 0, g: 0, b: 0, a: 0 }), "#00000000");
    assert.equal(toHex({ r: 255, g: 255, b: 255, a: 0.5 }), "#ffffff80");
  });

  test("an alpha that rounds to opaque uses the short form", () => {
    // Otherwise the field shows #…fe, which reads as translucent but isn't.
    assert.equal(toHex({ r: 0, g: 0, b: 0, a: 0.999 }), "#000000");
  });

  test("clamps out-of-range channels rather than emitting invalid hex", () => {
    assert.equal(toHex({ r: 300, g: -20, b: 0, a: 5 }), "#ff0000");
  });

  test("always produces something parseHex accepts", () => {
    for (const c of [{ r: 1, g: 2, b: 3, a: 1 }, { r: 250, g: 0, b: 9, a: 0.25 }]) {
      assert.notEqual(parseHex(toHex(c)), null);
    }
  });
});

describe("rgbToHsv / hsvToRgb", () => {
  test("round-trips the primaries exactly", () => {
    for (const c of [
      { r: 255, g: 0, b: 0, a: 1 }, { r: 0, g: 255, b: 0, a: 1 }, { r: 0, g: 0, b: 255, a: 1 },
      { r: 0, g: 255, b: 255, a: 1 }, { r: 255, g: 0, b: 255, a: 1 }, { r: 255, g: 255, b: 0, a: 1 },
    ]) {
      assert.deepEqual(hsvToRgb(rgbToHsv(c)), c);
    }
  });

  test("round-trips an arbitrary colour within a rounding step", () => {
    const c = { r: 47, g: 84, b: 235, a: 1 };
    const back = hsvToRgb(rgbToHsv(c));
    for (const k of ["r", "g", "b"] as const) {
      assert.ok(Math.abs(back[k] - c[k]) <= 1, `${k}: ${back[k]} vs ${c[k]}`);
    }
  });

  test("greys have zero saturation and an unimportant hue", () => {
    const g = rgbToHsv({ r: 128, g: 128, b: 128, a: 1 });
    assert.equal(g.s, 0);
    assert.deepEqual(hsvToRgb({ ...g, h: 210 }), { r: 128, g: 128, b: 128, a: 1 });
  });

  test("black keeps saturation at zero rather than dividing by it", () => {
    const k = rgbToHsv({ r: 0, g: 0, b: 0, a: 1 });
    assert.equal(k.v, 0);
    assert.equal(k.s, 0);
    assert.ok(Number.isFinite(k.h));
  });

  test("alpha rides along untouched", () => {
    assert.equal(rgbToHsv({ r: 10, g: 20, b: 30, a: 0.4 }).a, 0.4);
    assert.equal(hsvToRgb({ h: 120, s: 1, v: 1, a: 0.4 }).a, 0.4);
  });

  test("hue wraps instead of clipping", () => {
    assert.deepEqual(hsvToRgb({ h: 360, s: 1, v: 1, a: 1 }), hsvToRgb({ h: 0, s: 1, v: 1, a: 1 }));
    assert.deepEqual(hsvToRgb({ h: -120, s: 1, v: 1, a: 1 }), hsvToRgb({ h: 240, s: 1, v: 1, a: 1 }));
  });
});

describe("pageColors", () => {
  test("collects text and background colours from every block", () => {
    const blocks = [
      { styles: { heading: { color: "#2F54EB" }, lead: { bg: "#ffffff" } } },
      { styles: { cta1Label: { color: "#2f54eb", bg: "#000000" } } },
    ];
    assert.deepEqual(pageColors(blocks), ["#2f54eb", "#ffffff", "#000000"]);
  });

  test("deduplicates case-insensitively — the picker emits lower case", () => {
    assert.deepEqual(pageColors([{ styles: { a: { color: "#ABCDEF" }, b: { color: "#abcdef" } } }]), ["#abcdef"]);
  });

  test("skips unparseable values instead of showing a broken swatch", () => {
    assert.deepEqual(pageColors([{ styles: { a: { color: "red", bg: "#fff" } } }]), ["#ffffff"]);
  });

  test("caps the list so a long page can't produce a swatch wall", () => {
    const styles: any = {};
    for (let i = 0; i < 40; i++) styles["k" + i] = { color: "#" + i.toString(16).padStart(6, "0") };
    assert.equal(pageColors([{ styles }], 24).length, 24);
  });

  test("survives blocks with no styles at all", () => {
    assert.deepEqual(pageColors([{}, { styles: null }, null, undefined] as any), []);
    assert.deepEqual(pageColors(null as any), []);
  });
});
