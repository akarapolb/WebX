import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="card"]`;

describe("component size", () => {
  test("width, height and their limits take a number and a unit", () => {
    const out = css({ card: { width: "50%", height: "320px", minWidth: "10rem", minHeight: "40vh", maxWidth: "960px", maxHeight: "80vh" } });
    for (const d of ["width:50%", "height:320px", "min-width:10rem", "min-height:40vh", "max-width:960px", "max-height:80vh"]) {
      assert.ok(out.includes(d + "!important"), d);
    }
  });

  test("auto is allowed for width and height, none for the maximums, and nowhere else", () => {
    assert.ok(css({ card: { width: "auto", height: "auto", maxWidth: "none", maxHeight: "none" } }).includes("width:auto!important;height:auto!important;max-width:none!important;max-height:none!important"));
    assert.equal(css({ card: { minWidth: "auto", minHeight: "none", maxWidth: "auto" } }), "");
  });

  test("values are clamped per unit", () => {
    const out = css({ card: { width: "9999%", height: "9999px", minHeight: "500vh", maxWidth: "9999rem" } });
    assert.ok(out.includes("width:100%") && out.includes("height:4000px") && out.includes("min-height:100vh") && out.includes("max-width:250rem"));
  });

  test("decimals are kept to two places", () => {
    assert.ok(css({ card: { width: "33.33%" } }).includes("width:33.33%"));
    assert.equal(css({ card: { width: "33.333%" } }), "");
  });

  test("anything but number+unit is dropped", () => {
    for (const bad of ["50", "px", "50 px", "-10px", "50pt", "calc(100% - 10px)", "50%;color:red", "50%}</style>", "url(x)", "1e3px", ".5px", "", null, 50, {}, [], true]) {
      assert.equal(css({ card: { width: bad } }), "", String(bad));
    }
  });

  test("a zero size is a real value", () => {
    assert.ok(css({ card: { minHeight: "0px" } }).includes("min-height:0px!important"));
  });

  test("a size makes a style non-empty and cascades through devices", () => {
    assert.equal(isEmptyStyle({ width: "50%" } as any), false);
    const out = css({ card: { width: "50%", mobile: { width: "100%" } } });
    assert.ok(out.includes(`${SEL}{width:50%!important}`));
    assert.ok(out.includes(`@media (max-width: 639.98px){${SEL}{width:100%!important}}`));
  });
});
