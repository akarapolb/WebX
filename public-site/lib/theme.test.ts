// themeToCss turns an admin-writable JSON blob into raw CSS on a public page,
// so most of these tests are about what must NOT get through. A test that only
// checks "a valid colour produces a rule" proves very little on its own.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeTheme, themeToCss, FONT_STACKS, TYPE_LIMITS } from "./theme";

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

describe("typography", () => {
  test("clamps and steps every number into its allowed range", () => {
    const t = sanitizeTheme({ type: { size: 400, leading: 0.2, headingScale: 7 } });
    assert.equal(t.type?.size, TYPE_LIMITS.size.max);
    assert.equal(t.type?.leading, TYPE_LIMITS.leading.min);
    assert.equal(t.type?.headingScale, TYPE_LIMITS.headingScale.max);
    assert.equal(sanitizeTheme({ type: { size: 107 } }).type?.size, 105);
    assert.equal(sanitizeTheme({ type: { leading: 1.73 } }).type?.leading, 1.75);
  });

  test("drops non-numbers, NaN, Infinity and strings that look like CSS", () => {
    const t = sanitizeTheme({ type: { size: "110; } body{x:y", leading: NaN, headingScale: Infinity } });
    assert.equal(t.type, undefined);
  });

  test("only the weights the shipped fonts have are accepted", () => {
    assert.equal(sanitizeTheme({ type: { weight: 900 } }).type, undefined);
    assert.equal(sanitizeTheme({ type: { weight: "400" } }).type, undefined);
    assert.equal(sanitizeTheme({ type: { headingWeight: 300 } }).type, undefined);
    assert.deepEqual(sanitizeTheme({ type: { weight: 300, headingWeight: 700 } }).type, { weight: 300, headingWeight: 700 });
  });

  test("emits one rule per line, scoped away from the accessibility font-size toggle", () => {
    const css = themeToCss("orst", { type: { size: 110, leading: 1.8, weight: 500, headingWeight: 700, headingScale: 1.1 } });
    for (const line of css.split("\n")) {
      assert.equal(line.split("{").length - 1, 1);
      assert.equal(line.split("}").length - 1, 1);
    }
    const scope = ':root:not([data-font-size="small"]):not([data-font-size="large"])';
    assert.ok(css.includes(scope + "{font-size:110%}"));
    assert.ok(css.includes(scope + " body{font-size:1rem}"));
    assert.ok(css.includes("body{line-height:1.8;font-weight:500}"));
    assert.ok(css.includes("h1,h2,h3{font-weight:700}"));
    assert.ok(css.includes("--orst-display-xl:calc(clamp(2.4rem, 1.6rem + 3.4vw, 4.2rem)*1.1)"));
    assert.doesNotMatch(css, /[<>]|url\(|@import|expression/i);
  });

  test("a theme with no type settings emits no type rules (defaults stay the stylesheet's)", () => {
    const css = themeToCss("orst", { radius: 10 });
    assert.doesNotMatch(css, /font-size|line-height|font-weight|display-xl/);
  });

  test("RoyalSociety ignores type settings — its stylesheet has no such tokens", () => {
    assert.equal(themeToCss("royalsociety", { type: { size: 110 } }), "");
  });
});

describe("custom palette", () => {
  test("keeps valid entries, with a hex value and an id c1–c8", () => {
    const t = sanitizeTheme({ palette: [{ id: "c1", name: "Sky", value: "#3388cc" }, { id: "c4", name: "Rose", value: "#FF6699" }] });
    assert.deepEqual(t.palette, [{ id: "c1", name: "Sky", value: "#3388cc" }, { id: "c4", name: "Rose", value: "#ff6699" }]);
  });

  test("drops entries with a bad id, a non-hex value, or a repeated id", () => {
    const t = sanitizeTheme({ palette: [
      { id: "c9", value: "#111111" }, { id: "c0", value: "#111111" }, { id: "x1", value: "#111111" }, { id: "c1; x", value: "#111111" },
      { id: "c2", value: "red" }, { id: "c2", value: "rgb(0,0,0)" }, { id: "c3", value: "#123456; } body{x:y" },
      { id: "c5", value: "#111111" }, { id: "c5", value: "#222222" }, null, "c6", 7,
    ] });
    assert.deepEqual(t.palette, [{ id: "c5", name: "C5", value: "#111111" }]);
  });

  test("at most eight entries are read", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: "c" + ((i % 8) + 1), name: "n", value: "#101010" }));
    assert.ok((sanitizeTheme({ palette: many }).palette ?? []).length <= 8);
  });

  test("a name is trimmed, cleaned and capped — and never reaches the CSS", () => {
    const t = sanitizeTheme({ palette: [{ id: "c1", name: "  <b>Brand\u0000 blue</b>" + "x".repeat(50), value: "#3388cc" }] });
    assert.ok(t.palette![0].name.length <= 24);
    assert.doesNotMatch(t.palette![0].name, /[<>\u0000]/);
    assert.equal(sanitizeTheme({ palette: [{ id: "c2", name: "   ", value: "#3388cc" }] }).palette![0].name, "C2");
    const css = themeToCss("orst", { palette: [{ id: "c1", name: 'Evil"; } body{x:y', value: "#3388cc" }] });
    assert.doesNotMatch(css, /Evil|body/);
  });

  test("each entry becomes a --wx-c-<id> variable, in light and dark alike", () => {
    const css = themeToCss("orst", { palette: [{ id: "c1", name: "Sky", value: "#3388cc" }, { id: "c3", name: "Rose", value: "#ff6699" }] });
    assert.ok(css.includes(":root{--wx-c-c1:#3388cc;--wx-c-c3:#ff6699}"));
    assert.doesNotMatch(css, /data-theme/);   // not scoped to light mode
    for (const line of css.split("\n")) {
      assert.equal(line.split("{").length - 1, 1);
      assert.equal(line.split("}").length - 1, 1);
    }
  });

  test("RoyalSociety gets the palette too; an unknown tenant gets nothing", () => {
    assert.ok(themeToCss("royalsociety", { palette: [{ id: "c1", name: "A", value: "#102030" }] }).includes("--wx-c-c1:#102030"));
    assert.equal(themeToCss("dga", { palette: [{ id: "c1", name: "A", value: "#102030" }] }), "");
  });

  test("no palette, no variables", () => {
    assert.doesNotMatch(themeToCss("orst", { radius: 10 }), /wx-c-/);
  });
});
