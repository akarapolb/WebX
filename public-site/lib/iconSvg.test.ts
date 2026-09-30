// sanitizeIconSvg is the security boundary for editor-supplied icon markup:
// whatever it returns is inlined into a public page. The input can be any
// .svg file someone imported, so these tests are mostly about what must NOT
// survive — a passing "it renders a path" test proves very little on its own.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeIconSvg, safeViewBox } from "./iconSvg";

const clean = (s: string) => sanitizeIconSvg(s);

describe("sanitizeIconSvg — what survives", () => {
  test("keeps a plain path", () => {
    assert.equal(clean('<path d="M0 0h24v24H0z"/>'), '<path d="M0 0h24v24H0z"/>');
  });

  test("unwraps a whole svg document and keeps its children", () => {
    const out = clean('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 2"/></svg>');
    assert.equal(out, '<path d="M1 2"/>');
  });

  test("keeps the presentation attributes an icon actually needs", () => {
    const out = clean('<path d="M1 2" fill-rule="evenodd" clip-rule="evenodd" opacity=".3"/>');
    assert.match(out, /fill-rule="evenodd"/);
    assert.match(out, /clip-rule="evenodd"/);
    assert.match(out, /opacity="\.3"/);
  });

  test("normalises the camelCase spellings JSX uses", () => {
    assert.match(clean('<path d="M1 2" fillRule="evenodd" strokeWidth="2"/>'), /fill-rule="evenodd"/);
    assert.match(clean('<path d="M1 2" strokeWidth="2"/>'), /stroke-width="2"/);
  });

  test("keeps grouping and local clip references", () => {
    const out = clean('<g clip-path="url(#a)"><path d="M1 2"/></g>');
    assert.match(out, /^<g clip-path="url\(#a\)">/);
    assert.match(out, /<\/g>$/);
  });

  test("keeps every shape element an icon set uses", () => {
    for (const el of ["circle", "ellipse", "rect", "line", "polyline", "polygon"]) {
      assert.match(clean(`<${el} fill="red"/>`), new RegExp(`^<${el} `), el);
    }
  });
});

describe("sanitizeIconSvg — root presentation attributes", () => {
  // Line-icon sets (Feather, Lucide, Heroicons outline) declare fill/stroke on
  // the OUTER <svg> only. Dropping the root outright turns every one of them
  // into a solid blob, so they are carried onto a wrapping <g> instead.
  test("carries a line icon's root fill/stroke onto a wrapping group", () => {
    const out = clean('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 2"/></svg>');
    assert.equal(out, '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 2"/></g>');
  });

  test("a filled icon with nothing presentational on the root gets no wrapper", () => {
    assert.equal(clean('<svg viewBox="0 0 24 24"><path d="M1 2"/></svg>'), '<path d="M1 2"/>');
  });

  test("root geometry is discarded — the renderer supplies its own size", () => {
    const out = clean('<svg width="500" height="500" x="9" y="9" viewBox="0 0 24 24" fill="none"><path d="M1 2"/></svg>');
    assert.equal(out, '<g fill="none"><path d="M1 2"/></g>');
  });

  test("hostile root attributes are dropped exactly as on any other element", () => {
    const out = clean('<svg onload="alert(1)" style="background:url(//evil)" href="//evil" fill="javascript:x" stroke="currentColor"><path d="M1 2"/></svg>');
    assert.equal(out, '<g stroke="currentColor"><path d="M1 2"/></g>');
  });

  test("a root that is given but yields no content gives nothing, not an empty group", () => {
    assert.equal(clean('<svg fill="none"></svg>'), "");
    assert.equal(clean('<svg fill="none"><script>alert(1)</script></svg>'), "");
  });

  test("an attribute value on the root is escaped like any other", () => {
    const out = clean(`<svg stroke='a" onload="alert(1)'><path d="M1 2"/></svg>`);
    // The quote is escaped, so "onload" stays inside the stroke value rather
    // than becoming an attribute: the wrapper carries exactly one, stroke.
    assert.equal(out, '<g stroke="a&quot; onload=&quot;alert(1)"><path d="M1 2"/></g>');
    assert.equal((out.match(/<g[^>]*>/)![0].match(/\s[a-z-]+="/g) || []).length, 1, out);
  });
});

describe("sanitizeIconSvg — what must not survive", () => {
  test("drops script, however it is wrapped", () => {
    for (const s of [
      '<script>alert(1)</script><path d="M1 2"/>',
      '<svg><script>alert(1)</script><path d="M1 2"/></svg>',
      '<svg:script>alert(1)</svg:script><path d="M1 2"/>',
      '<SCRIPT>alert(1)</SCRIPT><path d="M1 2"/>',
    ]) {
      const out = clean(s);
      assert.equal(/script|alert/i.test(out), false, s);
      assert.match(out, /<path d="M1 2"\/>/);
    }
  });

  test("drops every event handler", () => {
    for (const attr of ["onload", "onclick", "onerror", "onmouseover", "ONLOAD", "onFocus"]) {
      const out = clean(`<path d="M1 2" ${attr}="alert(1)"/>`);
      assert.equal(/alert|on[a-z]+=/i.test(out), false, attr);
      assert.equal(out, '<path d="M1 2"/>');
    }
  });

  test("drops elements that can fetch or execute", () => {
    for (const s of [
      '<foreignObject><iframe src="//evil"></iframe></foreignObject>',
      '<image href="//evil/x.png"/>',
      '<use href="//evil#x"/>',
      '<a href="javascript:alert(1)"><path d="M1 2"/></a>',
      '<animate attributeName="x" to="1"/>',
      '<set attributeName="onload" to="alert(1)"/>',
      '<style>*{background:url(//evil)}</style>',
    ]) {
      const out = clean(s);
      assert.equal(/evil|javascript|iframe|foreignObject|<use|<image|<animate|<style/i.test(out), false, s);
    }
  });

  test("drops href in every spelling, so nothing can be fetched", () => {
    const out = clean('<path d="M1 2" href="//evil" xlink:href="//evil" src="//evil"/>');
    assert.equal(out, '<path d="M1 2"/>');
  });

  test("rejects a value carrying a scheme", () => {
    for (const v of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript :alert(1)", "data:text/html,x", "vbscript:x"]) {
      assert.equal(clean(`<path d="M1 2" fill="${v}"/>`), '<path d="M1 2"/>', v);
    }
  });

  test("rejects a url() that is not a local reference", () => {
    assert.equal(clean('<path d="M1 2" clip-path="url(//evil/x)"/>'), '<path d="M1 2"/>');
    assert.equal(clean('<path d="M1 2" fill="url(http://evil)"/>'), '<path d="M1 2"/>');
    assert.match(clean('<path d="M1 2" clip-path="url(#ok)"/>'), /clip-path="url\(#ok\)"/);
  });

  test("rejects entity-encoded values rather than trying to decode them", () => {
    assert.equal(clean('<path d="M1 2" fill="&#106;avascript:alert(1)"/>'), '<path d="M1 2"/>');
  });

  test("drops style attributes outright", () => {
    assert.equal(clean('<path d="M1 2" style="background:url(//evil)"/>'), '<path d="M1 2"/>');
  });

  test("markup hidden in a comment or CDATA never reaches the output", () => {
    assert.equal(/script/i.test(clean('<!-- <script>alert(1)</script> --><path d="M1 2"/>')), false);
    assert.equal(/script/i.test(clean('<![CDATA[<script>alert(1)</script>]]><path d="M1 2"/>')), false);
  });

  test("cannot emit an unbalanced tag that would swallow the page", () => {
    // An unclosed <g> would otherwise wrap whatever markup followed it.
    const out = clean('<g><path d="M1 2"/>');
    assert.equal(out, '<g><path d="M1 2"/></g>');
  });

  test("escapes a quote inside a value so it cannot start a new attribute", () => {
    // The word "onload" legitimately survives INSIDE the d value — what
    // matters is that the quote closing it is escaped, so the browser never
    // sees an onload attribute.
    const out = clean('<path d=\'M1 2" onload="alert(1)\'/>');
    assert.equal(out, '<path d="M1 2&quot; onload=&quot;alert(1)"/>');
    // One attribute, and it is d: no bare `="` pair can appear after it.
    assert.equal((out.match(/\s[a-z-]+="/g) || []).length, 1, out);
  });

  test("title text is escaped, not passed through", () => {
    const out = clean("<title><script>alert(1)</script></title>");
    assert.equal(/<script/i.test(out), false);
  });
});

describe("sanitizeIconSvg — limits and bad input", () => {
  test("non-strings and empties give an empty result", () => {
    for (const v of [null, undefined, 0, {}, [], "", "   "]) {
      assert.equal(sanitizeIconSvg(v as any), "", JSON.stringify(v));
    }
  });

  test("refuses an absurdly long document instead of walking it", () => {
    assert.equal(sanitizeIconSvg('<path d="' + "M".repeat(30000) + '"/>'), "");
  });

  test("caps the number of elements", () => {
    const out = clean('<path d="M1 2"/>'.repeat(500));
    assert.ok((out.match(/<path/g) || []).length <= 200);
  });

  test("markup with nothing usable yields an empty string, not a broken fragment", () => {
    assert.equal(clean("<script>alert(1)</script>"), "");
    assert.equal(clean("plain text"), "");
  });
});

describe("safeViewBox", () => {
  test("accepts four numbers", () => {
    assert.equal(safeViewBox("0 0 24 24"), "0 0 24 24");
    assert.equal(safeViewBox("-2 -2 28.5 28.5"), "-2 -2 28.5 28.5");
  });

  test("falls back for anything else", () => {
    for (const v of ["0 0 24", "0 0 24 24 24", "a b c d", "", null, undefined, 24, "0,0,24,24"]) {
      assert.equal(safeViewBox(v as any), "0 0 24 24", JSON.stringify(v));
    }
  });

  test("honours a caller's own fallback", () => {
    assert.equal(safeViewBox("nope", "0 0 16 16"), "0 0 16 16");
  });
});
