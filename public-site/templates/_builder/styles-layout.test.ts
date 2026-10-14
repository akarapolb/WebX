import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="row"]`;

describe("component layout", () => {
  test("a flex row with its alignment, wrap and gap", () => {
    const out = css({ row: { display: "flex", flexDirection: "column", justifyContent: "between", alignItems: "center", flexWrap: "wrap", gap: "1.5rem" } });
    for (const d of ["display:flex", "flex-direction:column", "justify-content:space-between", "align-items:center", "flex-wrap:wrap", "gap:1.5rem"]) {
      assert.ok(out.includes(d + "!important"), d);
    }
  });

  test("names map to the right CSS keywords", () => {
    const out = css({ row: { justifyContent: "start", alignItems: "end" } });
    assert.ok(out.includes("justify-content:flex-start") && out.includes("align-items:flex-end"));
    assert.ok(css({ row: { justifyContent: "evenly" } }).includes("justify-content:space-evenly"));
  });

  test("a grid with N equal columns, clamped to 1-12", () => {
    assert.ok(css({ row: { display: "grid", gridColumns: 3 } }).includes("grid-template-columns:repeat(3,minmax(0,1fr))!important"));
    assert.ok(css({ row: { gridColumns: 99 } }).includes("repeat(12,"));
    assert.ok(css({ row: { gridColumns: 0 } }).includes("repeat(1,"));
  });

  test("display none hides, and on a phone override hides only there", () => {
    const out = css({ row: { mobile: { display: "none" } } });
    assert.equal(out, `@media (max-width: 639.98px){${SEL}{display:none!important}}`);
  });

  test("position can only be static or relative — nothing that floats over the page", () => {
    assert.ok(css({ row: { position: "relative" } }).includes("position:relative!important"));
    for (const bad of ["absolute", "fixed", "sticky", "-webkit-sticky"]) assert.equal(css({ row: { position: bad } }), "", bad);
  });

  test("z-index is a clamped integer", () => {
    assert.ok(css({ row: { zIndex: 5 } }).includes("z-index:5!important"));
    assert.ok(css({ row: { zIndex: 99999 } }).includes("z-index:100!important"));
    assert.ok(css({ row: { zIndex: -99 } }).includes("z-index:-10!important"));
    assert.ok(css({ row: { zIndex: 0 } }).includes("z-index:0!important"));
  });

  test("overflow takes fixed keywords", () => {
    assert.ok(css({ row: { overflow: "hidden" } }).includes("overflow:hidden!important"));
    assert.equal(css({ row: { overflow: "scroll" } }), "");
  });

  test("unknown or hostile names are dropped, including object-prototype keys", () => {
    for (const k of ["display", "flexDirection", "justifyContent", "alignItems", "flexWrap", "position", "overflow"]) {
      for (const bad of ["flow-root", "constructor", "__proto__", "toString", "hasOwnProperty", `flex;}</style>`, null, 5, {}, []]) {
        assert.equal(css({ row: { [k]: bad } }), "", `${k}=${String(bad)}`);
      }
    }
    assert.equal(css({ row: { gap: "calc(1px)", gridColumns: "x", zIndex: "y" } }), "");
  });

  test("layout alone makes a style non-empty; states do not carry it", () => {
    assert.equal(isEmptyStyle({ display: "flex" } as any), false);
    assert.equal(css({ row: { hover: { display: "none", gap: "1px", position: "relative" } as any } }), "");
  });
});
