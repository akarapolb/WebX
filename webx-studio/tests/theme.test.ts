import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, compactTheme, themeSupported, THEME_DEFAULTS, FONT_OPTIONS, AA } from "../lib/theme";

describe("contrastRatio", () => {
  test("black on white is 21:1, same colour is 1:1", () => {
    assert.ok(Math.abs(contrastRatio("#000000", "#ffffff")! - 21) < 0.01);
    assert.ok(Math.abs(contrastRatio("#777777", "#777777")! - 1) < 0.001);
  });

  test("is symmetric", () => {
    assert.equal(contrastRatio("#073b34", "#fbf7ef"), contrastRatio("#fbf7ef", "#073b34"));
  });

  test("returns null rather than NaN for something that is not a colour", () => {
    assert.equal(contrastRatio("nope", "#ffffff"), null);
    assert.equal(contrastRatio("#fff", ""), null);
  });

  test("each tenant's shipped defaults pass AA, so the warning only fires on a real change", () => {
    for (const [k, d] of Object.entries(THEME_DEFAULTS)) {
      assert.ok(contrastRatio(d.colors.ink, d.colors.ground)! >= AA, k + " ink on ground");
      assert.ok(contrastRatio("#ffffff", d.colors.primary)! >= AA, k + " white on primary");
    }
  });
});

describe("compactTheme", () => {
  test("drops values equal to the tenant's default", () => {
    const d = THEME_DEFAULTS.orst;
    assert.deepEqual(compactTheme("orst", { colors: { ...d.colors }, fonts: { ...d.fonts }, radius: d.radius }), {});
  });

  test("is case-insensitive about a default colour", () => {
    assert.deepEqual(compactTheme("orst", { colors: { primary: THEME_DEFAULTS.orst.colors.primary.toUpperCase() } }), {});
  });

  test("keeps only what changed", () => {
    assert.deepEqual(
      compactTheme("orst", { colors: { primary: "#7a1f1f", ink: THEME_DEFAULTS.orst.colors.ink }, radius: 6 }),
      { colors: { primary: "#7a1f1f" }, radius: 6 },
    );
  });

  test("a radius of 0 is a real choice, not 'unset'", () => {
    assert.deepEqual(compactTheme("orst", { radius: 0 }), { radius: 0 });
  });
});

test("themeSupported only for tenants whose template reads the theme", () => {
  assert.equal(themeSupported("orst"), true);
  assert.equal(themeSupported("royalsociety"), true);
  assert.equal(themeSupported("dga"), false);
  assert.equal(themeSupported("constructor"), false);
});

test("every default font is an offered option", () => {
  const keys = new Set(FONT_OPTIONS.map((f) => f.key));
  for (const d of Object.values(THEME_DEFAULTS)) {
    assert.ok(keys.has(d.fonts.display) && keys.has(d.fonts.body));
  }
});
