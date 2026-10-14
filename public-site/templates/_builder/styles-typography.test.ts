import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="title"]`;
const MOB = "(max-width: 639.98px)";
const TAB = "(max-width: 1023.98px)";

describe("component typography", () => {
  test("font family is chosen by name and resolves to the theme's fonts", () => {
    assert.ok(css({ title: { fontFamily: "heading" } }).includes("font-family:var(--wx-font-heading)!important"));
    assert.ok(css({ title: { fontFamily: "body" } }).includes("font-family:var(--wx-font-body)!important"));
    assert.ok(css({ title: { fontFamily: "mono" } }).includes("font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important"));
  });

  test("a free-form font name is never accepted", () => {
    for (const bad of ["Comic Sans", "google:Prompt", `x;}</style>`, "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      assert.equal(css({ title: { fontFamily: bad } }), "", bad);
    }
  });

  test("line height is a clamped multiple, rounded to two places", () => {
    assert.ok(css({ title: { lineHeight: 1.6 } }).includes("line-height:1.6!important"));
    assert.ok(css({ title: { lineHeight: 1.456 } }).includes("line-height:1.46!important"));
    assert.ok(css({ title: { lineHeight: 99 } }).includes("line-height:3!important"));
    assert.ok(css({ title: { lineHeight: 0.1 } }).includes("line-height:0.8!important"));
  });

  test("a font size alone still sets the old 1.25 line; an explicit line height wins over it", () => {
    assert.ok(css({ title: { fontSize: 40 } }).includes("font-size:40px!important;line-height:1.25!important"));
    const out = css({ title: { fontSize: 40, lineHeight: 1.7 } });
    assert.ok(out.includes("line-height:1.7!important") && !out.includes("1.25"));
  });

  test("letter spacing is in em, clamped, and zero is a real value", () => {
    assert.ok(css({ title: { letterSpacing: 0.05 } }).includes("letter-spacing:0.05em!important"));
    assert.ok(css({ title: { letterSpacing: 0 } }).includes("letter-spacing:0em!important"));
    assert.ok(css({ title: { letterSpacing: 5 } }).includes("letter-spacing:0.5em!important"));
    assert.ok(css({ title: { letterSpacing: -5 } }).includes("letter-spacing:-0.1em!important"));
  });

  test("case, decoration and italic use fixed keywords only", () => {
    const out = css({ title: { textTransform: "uppercase", textDecoration: "underline", fontStyle: "italic" } });
    assert.ok(out.includes("text-transform:uppercase!important"));
    assert.ok(out.includes("text-decoration-line:underline!important"));
    assert.ok(out.includes("font-style:italic!important"));
    assert.equal(css({ title: { textTransform: "full-width", textDecoration: "overline", fontStyle: "oblique 40deg" } }), "");
  });

  test("not-a-number values mean 'not set', never 0", () => {
    for (const k of ["lineHeight", "letterSpacing"]) for (const v of [null, "", "x", NaN, undefined, true, {}, []]) {
      assert.equal(css({ title: { [k]: v } }), "", `${k}=${String(v)}`);
    }
  });

  test("typography alone makes a style non-empty", () => {
    assert.equal(isEmptyStyle({ fontFamily: "body" } as any), false);
    assert.equal(isEmptyStyle({ letterSpacing: 0 } as any), false);
    assert.equal(isEmptyStyle({ fontFamily: "nope" } as any), true);
  });

  test("hostile values never reach the output", () => {
    const evil = `1;}</style><script>alert(1)</script>`;
    assert.equal(css({ title: { fontFamily: evil, lineHeight: evil, letterSpacing: evil, textTransform: evil, textDecoration: evil, fontStyle: evil } }), "");
  });
});

describe("typography across devices", () => {
  test("a phone font size keeps the line height it inherits instead of resetting it to 1.25", () => {
    const out = css({ title: { fontSize: 40, lineHeight: 1.7, mobile: { fontSize: 24 } } });
    // it writes the line height that applies at that width (the inherited 1.7), so no other rule's value can win
    assert.ok(out.includes(`@media ${MOB}{${SEL}{font-size:24px!important;line-height:1.7!important}}`), out);
    assert.ok(!out.includes("line-height:1.25") || out.indexOf("line-height:1.25") < out.indexOf("@media"));
  });

  test("a phone font size with no line height anywhere still gets the usual 1.25", () => {
    const out = css({ title: { fontSize: 40, mobile: { fontSize: 24 } } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}{font-size:24px!important;line-height:1.25!important}}`));
  });

  test("the phone follows a tablet line height", () => {
    const out = css({ title: { fontSize: 40, tablet: { lineHeight: 1.5 }, mobile: { fontSize: 20 } } });
    assert.ok(out.includes(`@media ${TAB}{${SEL}{line-height:1.5!important}}`));
    assert.ok(out.includes(`@media ${MOB}{${SEL}{font-size:20px!important;line-height:1.5!important}}`));
  });

  test("a device can change only the letter spacing, case or font", () => {
    const out = css({ title: { mobile: { letterSpacing: 0.1, textTransform: "none", fontFamily: "body" } } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}{font-family:var(--wx-font-body)!important;letter-spacing:0.1em!important;text-transform:none!important}}`));
  });

  test("states do not carry typography", () => {
    const out = css({ title: { hover: { fontFamily: "mono", letterSpacing: 0.3, textTransform: "uppercase", lineHeight: 2 } as any } });
    assert.equal(out, "");
  });
});
