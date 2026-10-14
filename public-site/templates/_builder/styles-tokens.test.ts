import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="card"]`;

describe("spacing scale tokens", () => {
  test("a side can point at a step of the theme's scale", () => {
    assert.ok(css({ card: { paddingTop: "@3", paddingLeft: "@6", marginBottom: "@1" } })
      .includes("padding-top:var(--wx-space-3)!important;padding-left:var(--wx-space-6)!important;margin-bottom:var(--wx-space-1)!important"));
  });

  test("a token ignores the unit, a number still follows it", () => {
    const out = css({ card: { unit: "rem", paddingTop: "@2", paddingBottom: 2 } });
    assert.ok(out.includes("padding-top:var(--wx-space-2)!important") && out.includes("padding-bottom:2rem!important"));
  });

  test("only @1-@6 exist; anything else is dropped, including object-prototype names", () => {
    for (const bad of ["@0", "@7", "@", "@10", "@a", "3", "var(--x)", "constructor", "__proto__", "toString", "@3;}", null, {}, []]) {
      assert.equal(css({ card: { paddingTop: bad } }), "", String(bad));
    }
  });

  test("a token side works on a phone override and in dark mode", () => {
    assert.ok(css({ card: { mobile: { paddingTop: "@1" } } }).includes(`@media (max-width: 639.98px){${SEL}{padding-top:var(--wx-space-1)!important}}`));
    assert.ok(css({ card: { dark: { marginTop: "@4" } } }).includes("margin-top:var(--wx-space-4)!important"));
  });

  test("a token side makes a style non-empty", () => {
    assert.equal(isEmptyStyle({ paddingTop: "@2" } as any), false);
  });
});

describe("corner radius tokens", () => {
  test("the theme's corner, its small corner, and fully round", () => {
    assert.ok(css({ card: { radius: "@card" } }).includes("border-radius:var(--wx-radius-card)!important"));
    assert.ok(css({ card: { radius: "@sm" } }).includes("border-radius:var(--wx-radius-sm)!important"));
    assert.ok(css({ card: { radius: "@pill" } }).includes("border-radius:var(--wx-radius-pill)!important"));
  });

  test("a number still means px, clamped; zero is real", () => {
    assert.ok(css({ card: { radius: 12 } }).includes("border-radius:12px!important"));
    assert.ok(css({ card: { radius: 5000 } }).includes("border-radius:999px!important"));
    assert.ok(css({ card: { radius: 0 } }).includes("border-radius:0px!important"));
  });

  test("anything else is dropped — and null is 'not set', not zero", () => {
    for (const bad of ["@big", "@", "12px", "pill", "constructor", "__proto__", null, "", {}, [], true, NaN]) {
      assert.equal(css({ card: { radius: bad } }), "", String(bad));
    }
  });

  test("a phone can switch to a token, and the reverse", () => {
    assert.ok(css({ card: { radius: 20, mobile: { radius: "@pill" } } }).includes(`@media (max-width: 639.98px){${SEL}{border-radius:var(--wx-radius-pill)!important}}`));
    assert.ok(css({ card: { radius: "@card", mobile: { radius: 4 } } }).includes(`@media (max-width: 639.98px){${SEL}{border-radius:4px!important}}`));
  });
});
