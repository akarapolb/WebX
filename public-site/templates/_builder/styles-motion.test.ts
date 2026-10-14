import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="card"]`;
const MOB = "(max-width: 639.98px)";

describe("transform", () => {
  test("move, rotate and scale compose in that order", () => {
    assert.ok(css({ card: { moveX: 10, moveY: -20, rotate: 15, scale: 110 } })
      .includes("transform:translate(10px,-20px) rotate(15deg) scale(1.1)!important"));
  });

  test("only the parts that are set appear", () => {
    assert.ok(css({ card: { scale: 150 } }).includes("transform:scale(1.5)!important"));
    assert.ok(css({ card: { rotate: 45 } }).includes("transform:rotate(45deg)!important"));
    assert.ok(css({ card: { moveY: 8 } }).includes("transform:translate(0px,8px)!important"));
  });

  test("values are clamped, and zero is a real value", () => {
    assert.ok(css({ card: { scale: 9999, rotate: 9999, moveX: 9999, moveY: -9999 } }).includes("translate(400px,-400px) rotate(360deg) scale(3)"));
    assert.ok(css({ card: { scale: 1 } }).includes("scale(0.25)"));
    assert.ok(css({ card: { rotate: 0 } }).includes("rotate(0deg)"));
  });

  test("a hover lift keeps the main style's other parts", () => {
    const out = css({ card: { scale: 100, rotate: 5, hover: { scale: 108, moveY: -6 } } });
    assert.ok(out.includes(`${SEL}:hover{transform:translate(0px,-6px) rotate(5deg) scale(1.08)!important}`));
  });

  test("a phone override changes only what it sets and keeps the rest", () => {
    const out = css({ card: { scale: 120, rotate: 10, mobile: { scale: 100 } } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}{transform:rotate(10deg) scale(1)!important}}`));
  });

  test("it does not touch the individual translate property a moved component uses", () => {
    assert.ok(!/(^|[;{])translate:/.test(css({ card: { moveX: 5 } })));
  });

  test("hostile and non-numeric values are dropped", () => {
    for (const k of ["scale", "rotate", "moveX", "moveY"]) for (const v of ["x", null, "", [], {}, true, NaN, "1;}</style>"]) {
      assert.equal(css({ card: { [k]: v } }), "", `${k}=${String(v)}`);
    }
  });
});

describe("transition timing", () => {
  test("states fade over 180ms ease by default, and transform joins the list", () => {
    const out = css({ card: { hover: { bg: "#112233" } } });
    assert.ok(out.includes("transition:color 180ms ease,background-color 180ms ease,border-color 180ms ease,box-shadow 180ms ease,opacity 180ms ease,transform 180ms ease"));
  });

  test("duration and easing are the editor's", () => {
    const out = css({ card: { transitionMs: 400, easing: "ease-in-out", hover: { bg: "#112233" } } });
    assert.ok(out.includes("color 400ms ease-in-out") && out.includes("transform 400ms ease-in-out"));
  });

  test("duration is clamped, easing is a fixed list, zero is allowed", () => {
    assert.ok(css({ card: { transitionMs: 99999, hover: { bg: "#112233" } } }).includes("color 2000ms"));
    assert.ok(css({ card: { transitionMs: 0, hover: { bg: "#112233" } } }).includes("color 0ms"));
    assert.ok(css({ card: { easing: "cubic-bezier(0,0,0,0)", hover: { bg: "#112233" } } }).includes("color 180ms ease,"));
  });

  test("a transform in a state alone fades too", () => {
    assert.ok(css({ card: { hover: { scale: 105 } } }).includes("transform 180ms ease"));
  });

  test("with no state there is no transition, whatever the timing", () => {
    assert.ok(!css({ card: { transitionMs: 400, easing: "linear", bg: "#112233" } }).includes("transition"));
  });
});

describe("entrance animation", () => {
  test("plays from the component's own look, defined once as keyframes", () => {
    const out = css({ card: { animation: "slide-up" } });
    assert.ok(out.includes(`@media (prefers-reduced-motion:no-preference){${SEL}{animation:wx-in-slide-up 600ms ease-out 0ms both}`));
    assert.ok(out.includes("@keyframes wx-in-slide-up{from{opacity:0;transform:translateY(24px)}}"));
  });

  test("scroll-linked where the browser supports it", () => {
    const out = css({ card: { animation: "fade" } });
    assert.ok(out.includes(`@supports (animation-timeline:view()){${SEL}{animation:wx-in-fade auto linear both;animation-timeline:view();animation-range:entry 0% entry 60%}}`));
  });

  test("duration and delay, clamped", () => {
    assert.ok(css({ card: { animation: "zoom", animMs: 1200, animDelayMs: 300 } }).includes("animation:wx-in-zoom 1200ms ease-out 300ms both"));
    assert.ok(css({ card: { animation: "zoom", animMs: 5, animDelayMs: 99999 } }).includes("animation:wx-in-zoom 100ms ease-out 3000ms both"));
  });

  test("keyframes are written once however many components share an animation", () => {
    const out = css({ a: { animation: "fade" }, b: { animation: "fade" }, c: { animation: "zoom" } });
    assert.equal(out.split("@keyframes wx-in-fade").length - 1, 1);
    assert.equal(out.split("@keyframes wx-in-zoom").length - 1, 1);
  });

  test("never an animation name that is not on the list, including object-prototype names", () => {
    for (const bad of ["spin", "constructor", "__proto__", "toString", "fade;}</style>", null, 5, {}, []]) {
      assert.equal(css({ card: { animation: bad } }), "", String(bad));
    }
  });

  test("an animation alone makes a style non-empty", () => {
    assert.equal(isEmptyStyle({ animation: "fade" } as any), false);
    assert.equal(isEmptyStyle({ animMs: 500 } as any), true);
  });
});
