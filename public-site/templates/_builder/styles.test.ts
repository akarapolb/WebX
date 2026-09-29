// styles.ts is the security boundary for Visual-Builder-authored styling:
// everything it returns is interpolated verbatim into a <style> element on a
// public page. The editor that produces these values is not trusted to have
// produced safe ones — a block's JSON can also arrive from WordPress, from
// the agent, or from a restored version — so the tests that matter most here
// are the ones that prove a hostile value can neither escape the url() it
// sits in nor close the <style> element.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { styleDecls, stylesCss, isSafeColor, isSafeImageUrl, isEmptyStyle } from "./styles";

describe("isSafeColor", () => {
  test("accepts the four hex forms", () => {
    for (const c of ["#fff", "#ffff", "#ffffff", "#ffffffff", "#2F54EB"]) {
      assert.equal(isSafeColor(c), true, c);
    }
  });

  test("rejects every other CSS colour syntax", () => {
    // All legal CSS; none of it is something this module is willing to emit.
    for (const c of ["red", "rgb(0,0,0)", "rgba(0,0,0,.5)", "hsl(0 0% 0%)", "var(--accent)", "currentColor", "transparent"]) {
      assert.equal(isSafeColor(c), false, c);
    }
  });

  test("rejects malformed and non-string values", () => {
    for (const c of ["#12345", "#gg0000", "#", "", "#ffffff ", null, undefined, 0, {}]) {
      assert.equal(isSafeColor(c as any), false, JSON.stringify(c));
    }
  });
});

describe("isSafeImageUrl", () => {
  test("accepts a site-relative path and an absolute http(s) URL", () => {
    assert.equal(isSafeImageUrl("/uploads/hero.jpg"), true);
    assert.equal(isSafeImageUrl("https://cdn.example.org/a/b.png?v=2"), true);
    assert.equal(isSafeImageUrl("http://example.org/x.webp"), true);
  });

  test("rejects a value that would break out of url()", () => {
    for (const u of [
      'a.png");background:url("x',      // closes the url() and starts another declaration
      "a.png');color:red;('",
      "a.png)}[data-vb-c]{display:none",  // closes the whole rule
      "a.png</style><script>alert(1)</script>",
      "a.png\\22 ",                     // CSS escape for a quote
    ]) {
      assert.equal(isSafeImageUrl(u), false, u);
    }
  });

  test("rejects schemes other than http(s)", () => {
    for (const u of ["javascript:alert(1)", "data:image/svg+xml;base64,AAAA", "file:///etc/passwd", "//evil.example/x.png"]) {
      assert.equal(isSafeImageUrl(u), false, u);
    }
  });

  test("rejects whitespace, empties and absurd lengths", () => {
    assert.equal(isSafeImageUrl("/a b.png"), false);
    assert.equal(isSafeImageUrl(""), false);
    assert.equal(isSafeImageUrl("/" + "a".repeat(2100)), false);
    assert.equal(isSafeImageUrl(null as any), false);
  });
});

describe("styleDecls", () => {
  test("emits nothing for an empty or absent style", () => {
    assert.equal(styleDecls(undefined), "");
    assert.equal(styleDecls(null), "");
    assert.equal(styleDecls({}), "");
    assert.equal(isEmptyStyle({}), true);
  });

  test("renders the properties it recognises", () => {
    const css = styleDecls({ color: "#2f54eb", bg: "#fff", fontSize: 32, fontWeight: 700, align: "center", radius: 8, padding: 12 });
    assert.match(css, /color:#2f54eb!important/);
    assert.match(css, /background-color:#fff!important/);
    assert.match(css, /font-size:32px!important/);
    assert.match(css, /font-weight:700!important/);
    assert.match(css, /text-align:center!important/);
    assert.match(css, /border-radius:8px!important/);
    assert.match(css, /padding:12px!important/);
  });

  test("drops a bad value instead of emitting it, keeping its siblings", () => {
    const css = styleDecls({ color: "red; } body { display:none", fontSize: 20 } as any);
    assert.equal(css.includes("display:none"), false);
    assert.equal(css.includes("color:"), false);
    assert.match(css, /font-size:20px/);
  });

  test("clamps sizes rather than trusting them", () => {
    assert.match(styleDecls({ fontSize: 99999 }), /font-size:200px/);
    assert.match(styleDecls({ fontSize: -5 }), /font-size:8px/);
    assert.match(styleDecls({ radius: 1e9 }), /border-radius:999px/);
    assert.match(styleDecls({ padding: -40 }), /padding:0px/);
  });

  test("ignores a font weight that is not one of the nine real ones", () => {
    assert.equal(styleDecls({ fontWeight: 550 }), "");
    assert.match(styleDecls({ fontWeight: 500 }), /font-weight:500/);
  });

  test("ignores an alignment outside the allowed set", () => {
    assert.equal(styleDecls({ align: "justify" as any }), "");
    assert.equal(styleDecls({ align: "inherit" as any }), "");
  });

  test("a background image brings its own size/position/repeat", () => {
    const css = styleDecls({ bgImage: "/uploads/a.png" });
    assert.match(css, /background-image:url\("\/uploads\/a\.png"\)!important/);
    assert.match(css, /background-size:cover!important/);
    assert.match(css, /background-position:center!important/);
    assert.match(css, /background-repeat:no-repeat!important/);
  });

  test("honours the fit choice, and falls back to cover for a bad one", () => {
    assert.match(styleDecls({ bgImage: "/a.png", bgFit: "contain" }), /background-size:contain/);
    assert.match(styleDecls({ bgImage: "/a.png", bgFit: "url(x)" as any }), /background-size:cover/);
  });

  test("an unsafe image URL emits no background-image at all", () => {
    assert.equal(styleDecls({ bgImage: 'x");background:red;("' }), "");
  });

  test("nothing it emits can contain a quote, brace or angle bracket of its own", () => {
    // A blanket guard: whatever combination of hostile inputs, the output
    // must stay inside one declaration list.
    const hostile = {
      color: '#fff"',
      bg: "}</style><script>",
      bgImage: 'a.png");x:y("',
      align: "center;}" as any,
      fontSize: "20px;}" as any,
    };
    const css = styleDecls(hostile as any);
    for (const ch of ['"', "'", "{", "}", "<", ">", ";}"]) {
      assert.equal(css.includes(ch), false, `output contained ${ch}: ${css}`);
    }
  });
});

describe("stylesCss", () => {
  test("scopes each rule to the block's own index", () => {
    const css = stylesCss({ styles: { heading: { color: "#000" } } }, 3);
    assert.equal(css, '[data-vb-s="3"][data-vb-c="heading"]{color:#000!important}');
  });

  test("renders an item component key", () => {
    assert.match(stylesCss({ styles: { "items.2": { color: "#000" } } }, 0), /\[data-vb-c="items\.2"\]/);
  });

  test("drops a component key that isn't a plain identifier", () => {
    // Otherwise the key itself is an injection point, independent of values.
    for (const k of ['a"]{color:red}[x="', "a b", "../x", "]{}", "a".repeat(80)]) {
      assert.equal(stylesCss({ styles: { [k]: { color: "#000" } } }, 0), "", k);
    }
  });

  test("emits nothing when there are no styles, or they render nothing", () => {
    assert.equal(stylesCss({}, 0), "");
    assert.equal(stylesCss({ styles: null }, 0), "");
    assert.equal(stylesCss({ styles: "nope" }, 0), "");
    assert.equal(stylesCss({ styles: { heading: {} } }, 0), "");
    assert.equal(stylesCss(null, 0), "");
  });

  test("combines several components into one stylesheet", () => {
    const css = stylesCss({ styles: { heading: { color: "#000" }, lead: { fontSize: 14 } } }, 1);
    assert.match(css, /\[data-vb-c="heading"\]/);
    assert.match(css, /\[data-vb-c="lead"\]/);
  });
});
