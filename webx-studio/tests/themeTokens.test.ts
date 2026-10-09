import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { themeTokens, tokenInfo } from "../lib/themeTokens";
import { compactTheme, nextPaletteId, PALETTE_MAX } from "../lib/theme";
import { SPACE_LIMITS, SPACE_UNITS, STYLE_LIMITS, isBlankStyle, isTokenValue } from "../lib/componentStyle";
import { pageColors } from "../lib/color";

describe("themeTokens", () => {
  test("always offers the four core tokens, with the tenant's default colours", () => {
    const t = themeTokens("orst", undefined);
    assert.deepEqual(t.map((x) => x.token), ["@primary", "@accent", "@ground", "@ink"]);
    assert.equal(t[0].value, "#073b34");
    assert.ok(t.every((x) => x.core));
  });

  test("a saved theme colour replaces the default for its token", () => {
    const t = themeTokens("orst", { colors: { primary: "#112233" } });
    assert.equal(t.find((x) => x.token === "@primary")?.value, "#112233");
    assert.equal(t.find((x) => x.token === "@ink")?.value, "#1c211f");
  });

  test("custom palette entries follow the core four, with their own ids", () => {
    const t = themeTokens("orst", { palette: [{ id: "c2", name: "Sky", value: "#3388CC" }, { id: "c5", name: "", value: "#ff6699" }] });
    assert.deepEqual(t.slice(4).map((x) => [x.token, x.label, x.value, x.core]), [["@c2", "Sky", "#3388cc", false], ["@c5", "C5", "#ff6699", false]]);
  });

  test("ignores a palette entry with a bad id or colour (the site would drop it too)", () => {
    const t = themeTokens("orst", { palette: [{ id: "c9", name: "x", value: "#111111" }, { id: "c1", name: "x", value: "red" }, null] });
    assert.equal(t.length, 4);
  });

  test("tokenInfo resolves a stored token and says nothing about a hex", () => {
    const tokens = themeTokens("orst", { palette: [{ id: "c1", name: "Sky", value: "#3388cc" }] });
    assert.equal(tokenInfo(tokens, "@c1")?.label, "Sky");
    assert.equal(tokenInfo(tokens, "@primary")?.value, "#073b34");
    assert.equal(tokenInfo(tokens, "#3388cc"), null);
    assert.equal(tokenInfo(tokens, undefined), null);
  });

  test("a token whose entry was deleted still shows something instead of crashing", () => {
    const info = tokenInfo(themeTokens("orst", undefined), "@c3");
    assert.equal(info?.label, "c3");
    assert.equal(info?.value, "");
  });
});

describe("palette in the saved theme", () => {
  test("nextPaletteId picks the first free id and runs out after eight", () => {
    assert.equal(nextPaletteId([]), "c1");
    assert.equal(nextPaletteId([{ id: "c1", name: "", value: "#000000" }, { id: "c3", name: "", value: "#000000" }]), "c2");
    const full = Array.from({ length: PALETTE_MAX }, (_, i) => ({ id: "c" + (i + 1), name: "", value: "#000000" }));
    assert.equal(nextPaletteId(full), null);
  });

  test("compactTheme keeps a palette (it has no default) and cleans it", () => {
    const t = compactTheme("orst", { palette: [{ id: "c1", name: "  Sky  ", value: "#3388CC" }, { id: "c9", name: "bad", value: "#111111" }, { id: "c2", name: "x", value: "nope" }] });
    assert.deepEqual(t.palette, [{ id: "c1", name: "Sky", value: "#3388cc" }]);
  });

  test("an empty palette is not saved", () => {
    assert.equal(compactTheme("orst", { palette: [] }).palette, undefined);
    assert.equal(compactTheme("orst", { palette: [{ id: "c9", name: "", value: "#111111" }] }).palette, undefined);
  });
});

describe("component style limits", () => {
  test("every unit has a range for padding and margin, and only margins go negative", () => {
    for (const u of SPACE_UNITS) {
      assert.ok(SPACE_LIMITS.padding[u].min >= 0, "padding " + u);
      assert.ok(SPACE_LIMITS.margin[u].min < 0, "margin " + u);
      assert.ok(SPACE_LIMITS.padding[u].max > 0 && SPACE_LIMITS.margin[u].max > 0);
    }
  });

  test("the editor's px ranges match what the site clamps to", () => {
    assert.equal(SPACE_LIMITS.padding.px.max, 400);
    assert.equal(SPACE_LIMITS.margin.px.min, -200);
    assert.equal(STYLE_LIMITS.borderWidth.max, 20);
    assert.equal(STYLE_LIMITS.opacity.max, 100);
  });

  test("a token is recognised; a hex and an empty value are not", () => {
    assert.equal(isTokenValue("@primary"), true);
    assert.equal(isTokenValue("#ffffff"), false);
    assert.equal(isTokenValue(undefined), false);
  });

  test("a style made only of the new fields is not blank", () => {
    assert.equal(isBlankStyle({ shadow: "md" }), false);
    assert.equal(isBlankStyle({ opacity: 0 }), false);
    assert.equal(isBlankStyle({ paddingTop: undefined }), true);
  });
});

describe("page swatches", () => {
  test("collect the new colour fields, and skip theme tokens", () => {
    const blocks = [{ styles: { a: { color: "#111111", bg: "@ground", iconColor: "#222222", borderColor: "#333333", bgOverlay: "#44444480" }, b: { color: "@primary" } } }];
    assert.deepEqual(pageColors(blocks), ["#111111", "#222222", "#333333", "#44444480"]);
  });
});
