// The second batch of per-component styles: colour tokens, per-side spacing with
// units, background layout, border / shadow / opacity. Every value here ends up
// inside a <style> element on a public page, so most of these tests are about
// what must NOT get through.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { colorCss, isColorToken, isEmptyStyle, styleDecls, stylesCss, type Style } from "./styles";

const IMG = "/media/hero.jpg";

describe("colour tokens", () => {
  test("a token becomes its CSS variable, a hex stays a hex", () => {
    assert.equal(colorCss("@primary"), "var(--wx-c-primary)");
    assert.equal(colorCss("@c3"), "var(--wx-c-c3)");
    assert.equal(colorCss("#abc123"), "#abc123");
  });

  test("only the fixed token names are accepted", () => {
    for (const bad of ["@evil", "@c0", "@c9", "@c10", "@primary;color:red", "@primary)", "primary", "@", "@Primary", "var(--x)", "@primary ", "@ink}", undefined, null, 7]) {
      assert.equal(colorCss(bad), undefined, String(bad));
      assert.equal(isColorToken(bad), false);
    }
  });

  test("text, background, border and overlay colours all take tokens", () => {
    const css = styleDecls({ color: "@ink", bg: "@ground", borderWidth: 2, borderColor: "@accent", bgImage: IMG, bgOverlay: "@primary" });
    assert.ok(css.includes("color:var(--wx-c-ink)!important"));
    assert.ok(css.includes("background-color:var(--wx-c-ground)!important"));
    assert.ok(css.includes("border-color:var(--wx-c-accent)!important"));
    assert.ok(css.includes("linear-gradient(var(--wx-c-primary),var(--wx-c-primary))"));
  });

  test("a token reaches the text inside a component and its icons", () => {
    const css = stylesCss({ styles: { "items.0": { color: "@primary", iconColor: "@accent" } } }, 2);
    assert.ok(css.includes("{color:var(--wx-c-primary)!important}"));
    assert.ok(css.includes("svg *{color:var(--wx-c-accent)!important}"));
  });

  test("an icon token alone counts as a style (not thrown away as empty)", () => {
    assert.equal(isEmptyStyle({ iconColor: "@accent" }), false);
    assert.equal(isEmptyStyle({ iconColor: "@nope" }), true);
  });
});

describe("per-side spacing with units", () => {
  test("defaults to px and emits only the sides that are set", () => {
    const css = styleDecls({ paddingTop: 12, marginBottom: 20 });
    assert.ok(css.includes("padding-top:12px!important"));
    assert.ok(css.includes("margin-bottom:20px!important"));
    assert.doesNotMatch(css, /padding-left|margin-top|padding-right/);
  });

  test("the unit applies to every per-side value", () => {
    const css = styleDecls({ unit: "rem", paddingLeft: 1.5, paddingRight: 2, marginTop: 0.25 });
    assert.ok(css.includes("padding-left:1.5rem!important"));
    assert.ok(css.includes("padding-right:2rem!important"));
    assert.ok(css.includes("margin-top:0.25rem!important"));
    assert.ok(styleDecls({ unit: "%", paddingTop: 10 }).includes("padding-top:10%!important"));
    assert.ok(styleDecls({ unit: "em", paddingTop: 1 }).includes("padding-top:1em!important"));
  });

  test("an unknown unit falls back to px rather than reaching the stylesheet", () => {
    const css = styleDecls({ unit: "vw" as any, paddingTop: 5 });
    assert.ok(css.includes("padding-top:5px!important"));
    assert.doesNotMatch(css, /vw/);
  });

  test("values are clamped per unit, and margins may go negative", () => {
    assert.ok(styleDecls({ paddingTop: 9999 }).includes("padding-top:400px"));
    assert.ok(styleDecls({ paddingTop: -50 }).includes("padding-top:0px"));
    assert.ok(styleDecls({ marginTop: -50 }).includes("margin-top:-50px"));
    assert.ok(styleDecls({ marginTop: -9999 }).includes("margin-top:-200px"));
    assert.ok(styleDecls({ unit: "rem", paddingTop: 500 }).includes("padding-top:40rem"));
    assert.ok(styleDecls({ unit: "%", paddingTop: 500 }).includes("padding-top:50%"));
  });

  test("a side is emitted after the all-sides shorthand so it wins", () => {
    const css = styleDecls({ padding: 10, paddingTop: 30 });
    assert.ok(css.indexOf("padding:10px") < css.indexOf("padding-top:30px"));
  });

  test("non-numbers, NaN, Infinity and CSS-looking strings are dropped", () => {
    for (const bad of ["12px", "1; } body{x:y", null, NaN, Infinity, {}, [], true]) {
      assert.equal(styleDecls({ paddingTop: bad as any }), "", String(bad));
    }
  });
});

describe("background layout", () => {
  test("repeat, position and attachment go with an image", () => {
    const css = styleDecls({ bgImage: IMG, bgRepeat: "repeat-x", bgPosition: "right bottom", bgAttachment: "fixed", bgFit: "auto" });
    assert.ok(css.includes("background-repeat:repeat-x!important"));
    assert.ok(css.includes("background-position:right bottom!important"));
    assert.ok(css.includes("background-attachment:fixed!important"));
    assert.ok(css.includes("background-size:auto!important"));
  });

  test("the defaults are unchanged when nothing is chosen (centred, no tiling, cover)", () => {
    const css = styleDecls({ bgImage: IMG });
    assert.ok(css.includes("background-size:cover!important"));
    assert.ok(css.includes("background-position:center!important"));
    assert.ok(css.includes("background-repeat:no-repeat!important"));
    assert.doesNotMatch(css, /background-attachment/);
  });

  test("layout settings without an image emit nothing", () => {
    assert.equal(styleDecls({ bgRepeat: "repeat", bgPosition: "center", bgAttachment: "fixed", bgOverlay: "#00000080" }), "");
  });

  test("bad choices fall back to the defaults", () => {
    const css = styleDecls({ bgImage: IMG, bgRepeat: "space" as any, bgPosition: "10px 20px" as any, bgAttachment: "local" as any, bgFit: "100%" as any });
    assert.ok(css.includes("background-repeat:no-repeat"));
    assert.ok(css.includes("background-position:center!important"));
    assert.ok(css.includes("background-size:cover"));
    assert.doesNotMatch(css, /background-attachment|10px|local/);
  });

  test("an overlay is a one-colour gradient above the image", () => {
    const css = styleDecls({ bgImage: IMG, bgOverlay: "#00000099" });
    assert.ok(css.includes(`background-image:linear-gradient(#00000099,#00000099),url("${IMG}")!important`));
  });

  test("a hostile overlay colour is dropped and the image is kept", () => {
    const css = styleDecls({ bgImage: IMG, bgOverlay: "red);} body{x:y" });
    assert.ok(css.includes(`background-image:url("${IMG}")`));
    assert.doesNotMatch(css, /linear-gradient|red/);
  });
});

describe("border, shadow, opacity", () => {
  test("a border needs a width; the style defaults to solid", () => {
    const css = styleDecls({ borderWidth: 3, borderColor: "#112233" });
    assert.ok(css.includes("border-style:solid!important"));
    assert.ok(css.includes("border-width:3px!important"));
    assert.ok(css.includes("border-color:#112233!important"));
    assert.equal(styleDecls({ borderColor: "#112233", borderStyle: "dashed" }), "");
  });

  test("width 0 removes the border and ignores the colour", () => {
    const css = styleDecls({ borderWidth: 0, borderColor: "#112233" });
    assert.ok(css.includes("border-style:none!important"));
    assert.doesNotMatch(css, /border-color/);
  });

  test("the border style is one of four; anything else becomes solid", () => {
    assert.ok(styleDecls({ borderWidth: 1, borderStyle: "dashed" }).includes("border-style:dashed"));
    assert.ok(styleDecls({ borderWidth: 1, borderStyle: "groove" as any }).includes("border-style:solid"));
    assert.ok(styleDecls({ borderWidth: 1, borderStyle: "solid;x:y" as any }).includes("border-style:solid!important"));
  });

  test("border width is clamped to 20px", () => {
    assert.ok(styleDecls({ borderWidth: 999 }).includes("border-width:20px"));
  });

  test("a shadow is only ever one of the fixed presets", () => {
    assert.ok(styleDecls({ shadow: "md" }).includes("box-shadow:0 6px 16px rgba(0,0,0,.20)!important"));
    assert.ok(styleDecls({ shadow: "none" }).includes("box-shadow:none!important"));
    for (const bad of ["0 0 0 red", "md; x:y", "huge", "0 0 99px #fff", "__proto__", "constructor", "toString"]) {
      assert.equal(styleDecls({ shadow: bad as any }), "", bad);
    }
  });

  test("opacity is a percentage, 0 is allowed, null is 'not set'", () => {
    assert.ok(styleDecls({ opacity: 50 }).includes("opacity:0.5!important"));
    assert.ok(styleDecls({ opacity: 0 }).includes("opacity:0!important"));
    assert.ok(styleDecls({ opacity: 250 }).includes("opacity:1!important"));
    assert.ok(styleDecls({ opacity: -5 }).includes("opacity:0!important"));
    assert.equal(styleDecls({ opacity: null as any }), "");
    assert.equal(styleDecls({ opacity: "" as any }), "");
    assert.equal(styleDecls({ opacity: "half" as any }), "");
  });
});

describe("nothing hostile survives, whichever new field carries it", () => {
  const HOSTILE = ['"; } body{display:none', "</style><script>", "url(//evil)", "{}", "a;b", "\\", "'", "\n", "expression(1)"];
  const fields: (keyof Style)[] = ["unit", "bgRepeat", "bgPosition", "bgAttachment", "bgOverlay", "borderStyle", "borderColor", "shadow", "borderWidth", "opacity",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft"];

  test("no value for any new field can put a quote, brace or angle bracket of its own into the CSS", () => {
    for (const f of fields) {
      for (const h of HOSTILE) {
        const css = styleDecls({ bgImage: IMG, borderWidth: 1, [f]: h } as Style);
        // The only quotes/braces allowed are the url("…") the module itself writes.
        const stripped = css.replace(`url("${IMG}")`, "");
        assert.doesNotMatch(stripped, /["'{}<>\\]/, `${String(f)} = ${JSON.stringify(h)}`);
      }
    }
  });

  test("all new fields together still produce one clean declaration list", () => {
    const css = styleDecls({
      unit: "rem", paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4, marginTop: -1, marginBottom: 2,
      bgImage: IMG, bgRepeat: "repeat", bgPosition: "left top", bgAttachment: "fixed", bgOverlay: "@primary",
      borderWidth: 2, borderStyle: "dotted", borderColor: "@accent", shadow: "lg", opacity: 90,
    });
    assert.doesNotMatch(css.replace(`url("${IMG}")`, ""), /["'{}<>\\]/);
    assert.ok(css.split(";").every((d) => /^[a-z-]+:.+!important$/.test(d)), css);
  });
});
