// themeToCss turns an admin-writable JSON blob into raw CSS on a public page,
// so most of these tests are about what must NOT get through. A test that only
// checks "a valid colour produces a rule" proves very little on its own.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeTheme, themeToCss, FONT_STACKS } from "./theme";

describe("sanitizeTheme — what is dropped", () => {
  test("rejects anything that is not a hex colour", () => {
    const t = sanitizeTheme({ colors: {
      primary: "red", accent: "rgb(0,0,0)", ground: "#12", ink: "#123456; } body { display:none",
    } });
    assert.equal(t.colors, undefined);
  });

  test("rejects a CSS-injection attempt in a colour", () => {
    const t = sanitizeTheme({ colors: { primary: "#fff} *{background:url(//evil/x)}" } });
    assert.equal(t.colors, undefined);
  });

  test("rejects a free-form font family — only known keys pass", () => {
    const t = sanitizeTheme({ fonts: { display: "Arial; } body{x:y", body: "constructor" } });
    assert.equal(t.fonts, undefined);
  });

  test("does not accept inherited object keys as font names", () => {
    assert.equal(sanitizeTheme({ fonts: { body: "toString" } }).fonts, undefined);
    assert.equal(sanitizeTheme({ fonts: { body: "__proto__" } }).fonts, undefined);
  });

  test("ignores non-object input", () => {
    for (const v of [null, undefined, "x", 5, [], true]) assert.deepEqual(sanitizeTheme(v), {});
  });

  test("ignores a non-numeric radius", () => {
    assert.equal(sanitizeTheme({ radius: "20px" }).radius, undefined);
    assert.equal(sanitizeTheme({ radius: NaN }).radius, undefined);
    assert.equal(sanitizeTheme({ radius: Infinity }).radius, undefined);
  });
});

describe("sanitizeTheme — what is kept", () => {
  test("expands 3-digit hex and lower-cases", () => {
    assert.equal(sanitizeTheme({ colors: { primary: "#ABC" } }).colors?.primary, "#aabbcc");
  });

  test("clamps radius into range", () => {
    assert.equal(sanitizeTheme({ radius: 9999 }).radius, 40);
    assert.equal(sanitizeTheme({ radius: -5 }).radius, 0);
    assert.equal(sanitizeTheme({ radius: 12.6 }).radius, 13);
  });

  test("keeps every known font key", () => {
    for (const k of Object.keys(FONT_STACKS)) assert.equal(sanitizeTheme({ fonts: { body: k } }).fonts?.body, k);
  });
});

describe("themeToCss", () => {
  test("empty for an unknown tenant — no theme support, no overrides", () => {
    assert.equal(themeToCss("dga", { colors: { primary: "#112233" } }), "");
  });

  test("empty when there is nothing valid to apply", () => {
    assert.equal(themeToCss("orst", {}), "");
    assert.equal(themeToCss("orst", { colors: { primary: "nope" } }), "");
    assert.equal(themeToCss("orst", undefined), "");
  });

  test("uses each tenant's own property prefix", () => {
    assert.match(themeToCss("orst", { colors: { primary: "#112233" } }), /--orst-primary:#112233/);
    assert.match(themeToCss("royalsociety", { colors: { primary: "#112233" } }), /--rs-primary:#112233/);
    assert.doesNotMatch(themeToCss("royalsociety", { colors: { primary: "#112233" } }), /--orst-/);
  });

  test("colours never touch dark mode, fonts and radius apply to both", () => {
    const css = themeToCss("orst", { colors: { primary: "#112233" }, fonts: { body: "system-sans" }, radius: 10 });
    const [all, light] = css.split("\n");
    assert.match(all, /^:root\{/);
    assert.match(all, /--orst-font-body/);
    assert.match(all, /--orst-radius-card:10px/);
    assert.doesNotMatch(all, /--orst-primary/);
    assert.match(light, /^:root:not\(\[data-theme="dark"\]\)\{/);
    assert.match(light, /--orst-primary:#112233/);
  });

  test("derives the strong/soft shades from the primary instead of leaving the old green", () => {
    const css = themeToCss("orst", { colors: { primary: "#112233" } });
    assert.match(css, /--orst-primary-strong:color-mix\(in srgb,#112233 72%,#000\)/);
    assert.match(css, /--orst-primary-soft:color-mix\(in srgb,#112233 80%,#fff\)/);
    assert.match(css, /--orst-gradient-primary:linear-gradient\(/);
  });

  test("output contains no raw characters that could close the rule", () => {
    const css = themeToCss("orst", { colors: { primary: "#112233", accent: "#445566", ground: "#778899", ink: "#aabbcc" }, fonts: { display: "noto-serif", body: "plex-sans" }, radius: 20 });
    // Exactly one `{` and one `}` per rule — values can't have introduced more.
    for (const line of css.split("\n")) {
      assert.equal(line.split("{").length - 1, 1);
      assert.equal(line.split("}").length - 1, 1);
    }
    assert.doesNotMatch(css, /[<>]|url\(|@import|expression/i);
  });
});
