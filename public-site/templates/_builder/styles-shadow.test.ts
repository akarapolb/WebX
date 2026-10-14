import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="card"]`;

describe("custom shadow", () => {
  test("offsets, blur, spread and colour", () => {
    assert.ok(css({ card: { shadowX: 2, shadowY: 8, shadowBlur: 24, shadowSpread: -4, shadowColor: "#11223344" } })
      .includes("box-shadow:2px 8px 24px -4px #11223344!important"));
  });

  test("a theme token colour, and inset", () => {
    assert.ok(css({ card: { shadowColor: "@primary", shadowInset: true, shadowBlur: 10 } })
      .includes("box-shadow:inset 0px 4px 10px 0px var(--wx-c-primary)!important"));
  });

  test("unset parts default so a lone colour or blur still shows", () => {
    assert.ok(css({ card: { shadowColor: "#000000" } }).includes("box-shadow:0px 4px 12px 0px #000000!important"));
    assert.ok(css({ card: { shadowBlur: 30 } }).includes("box-shadow:0px 4px 30px 0px rgba(0,0,0,.25)!important"));
  });

  test("inset alone is not a shadow request; false is not inset", () => {
    assert.equal(css({ card: { shadowInset: false } }), "");
    assert.ok(!css({ card: { shadowInset: false, shadowBlur: 5 } }).includes("inset"));
  });

  test("values are clamped, zero is real", () => {
    const out = css({ card: { shadowX: 9999, shadowY: -9999, shadowBlur: 9999, shadowSpread: 9999 } });
    assert.ok(out.includes("box-shadow:100px -100px 200px 100px rgba(0,0,0,.25)"));
    assert.ok(css({ card: { shadowY: 0, shadowBlur: 0 } }).includes("box-shadow:0px 0px 0px 0px"));
  });

  test("a custom shadow wins over a preset", () => {
    const out = css({ card: { shadow: "xl", shadowBlur: 6 } });
    assert.ok(out.includes("box-shadow:0px 4px 6px 0px") && !out.includes("rgba(0,0,0,.32)"));
  });

  test("a preset alone is unchanged", () => {
    assert.ok(css({ card: { shadow: "md" } }).includes("box-shadow:0 6px 16px rgba(0,0,0,.20)!important"));
  });

  test("hostile values are dropped", () => {
    const evil = `red;}</style><script>`;
    assert.equal(css({ card: { shadowX: evil, shadowY: evil, shadowBlur: evil, shadowSpread: evil, shadowColor: evil, shadowInset: evil } }), "");
    assert.ok(css({ card: { shadowColor: evil, shadowBlur: 5 } }).includes("rgba(0,0,0,.25)"));
    for (const v of [null, "", [], {}, true, NaN]) assert.equal(css({ card: { shadowX: v } }), "", String(v));
  });

  test("a phone override sets a preset over an inherited custom shadow, and the reverse", () => {
    const a = css({ card: { shadowBlur: 20, mobile: { shadow: "sm" } } });
    assert.ok(a.includes(`@media (max-width: 639.98px){${SEL}{box-shadow:0 1px 3px rgba(0,0,0,.18)!important}}`));
    const b = css({ card: { shadow: "sm", mobile: { shadowBlur: 2 } } });
    assert.ok(b.includes(`@media (max-width: 639.98px){${SEL}{box-shadow:0px 4px 2px 0px rgba(0,0,0,.25)!important}}`));
  });

  test("a phone changing only the blur keeps the inherited offsets and colour", () => {
    const out = css({ card: { shadowX: 3, shadowY: 9, shadowColor: "#112233", mobile: { shadowBlur: 2 } } });
    assert.ok(out.includes(`@media (max-width: 639.98px){${SEL}{box-shadow:3px 9px 2px 0px #112233!important}}`));
  });

  test("a shadow alone makes a style non-empty", () => {
    assert.equal(isEmptyStyle({ shadowBlur: 5 } as any), false);
  });
});
