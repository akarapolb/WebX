import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

// Regression tests for problems found when the style code was reviewed.

const css = (s: any) => stylesCss({ styles: { c: s } }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="c"]`;
const DARK = `:where(:root[data-theme="dark"]) `;
const MOB = "(max-width: 639.98px)";
const TAB = "(max-width: 1023.98px)";

describe("a cleared field is 'not set', never 0 or the minimum", () => {
  test("null, empty string and empty array do not become a font size, weight or padding", () => {
    for (const v of [null, "", "   ", [], {}, true, NaN, undefined]) {
      assert.equal(css({ fontSize: v, fontWeight: v, padding: v }), "", String(v));
    }
  });

  test("the same inside a tablet or phone override", () => {
    assert.equal(css({ mobile: { fontSize: null, padding: "", fontWeight: [] } }), "");
    assert.equal(css({ fontSize: 20, mobile: { fontSize: null, padding: null } }), `${SEL}{font-size:20px!important;line-height:1.25!important}`);
  });

  test("real values, including zero padding, still work", () => {
    assert.ok(css({ padding: 0 }).includes("padding:0px!important"));
    assert.ok(css({ fontSize: "24" }).includes("font-size:24px!important"));
    assert.ok(css({ fontWeight: 700 }).includes("font-weight:700!important"));
  });
});

describe("dark mode keeps the tablet and phone cascade", () => {
  test("a dark font size does not reset the line height a phone set", () => {
    const out = css({ fontSize: 20, mobile: { lineHeight: 2 }, dark: { fontSize: 18 } });
    // the dark rule for the phone width is written after it, and carries the phone's line height —
    // without it the base dark rule's 1.25 would win (this once passed while the page still showed 1.25)
    assert.ok(out.includes(`@media ${MOB}{${DARK}${SEL}{font-size:18px!important;line-height:2!important}}`), out);
    assert.ok(out.indexOf(`@media ${MOB}{${DARK}`) > out.indexOf(`@media ${MOB}{${SEL}{line-height:2`));
  });

  test("a dark gradient keeps the angle a phone chose", () => {
    const out = css({ gradFrom: "#111111", gradTo: "#222222", gradAngle: 90, mobile: { gradAngle: 0 }, dark: { gradFrom: "#333333" } });
    assert.ok(out.includes(`${DARK}${SEL}{background-image:linear-gradient(90deg,#333333,#222222)!important}`));
    assert.ok(out.includes(`@media ${MOB}{${DARK}${SEL}{background-image:linear-gradient(0deg,#333333,#222222)!important}}`));
  });

  test("a dark transform keeps the scale a phone chose", () => {
    const out = css({ scale: 100, mobile: { scale: 50 }, dark: { moveX: 10 } });
    assert.ok(out.includes(`@media ${MOB}{${DARK}${SEL}{transform:translate(10px,0px) scale(0.5)!important}}`));
  });

  test("with no override that changes the result, no extra dark rule is written", () => {
    const out = css({ fontSize: 20, mobile: { opacity: 50 }, dark: { color: "#eeeeee" } });
    assert.equal(out.split(`${DARK}${SEL}{`).length - 1, 1);
  });

  test("the tablet override is honoured at tablet width and below", () => {
    const out = css({ fontSize: 20, tablet: { lineHeight: 1.8 }, dark: { fontSize: 16 } });
    assert.ok(out.includes(`@media ${TAB}{${DARK}${SEL}{font-size:16px!important;line-height:1.8!important}}`));
  });
});

describe("hover, focus and pressed follow the width too", () => {
  test("a hover gradient uses the angle a phone chose", () => {
    const out = css({ gradFrom: "#111111", gradTo: "#222222", gradAngle: 90, mobile: { gradAngle: 0 }, hover: { gradFrom: "#333333" } });
    assert.ok(out.includes(`@media (hover:hover){${SEL}:hover{background-image:linear-gradient(90deg,#333333,#222222)!important}}`));
    assert.ok(out.includes(`@media (hover:hover){@media ${MOB}{${SEL}:hover{background-image:linear-gradient(0deg,#333333,#222222)!important}}}`));
  });

  test("a hover transform uses the other parts a phone changed", () => {
    const out = css({ scale: 100, rotate: 5, mobile: { rotate: 0 }, hover: { scale: 110 } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}:hover{transform:rotate(0deg) scale(1.1)!important}}`) || out.includes(`@media (hover:hover){@media ${MOB}{${SEL}:hover{transform:rotate(0deg) scale(1.1)!important}}}`));
  });

  test("focus and pressed get the same treatment, without the hover wrapper", () => {
    const out = css({ gradFrom: "#111111", gradTo: "#222222", gradAngle: 90, mobile: { gradAngle: 0 }, focus: { gradTo: "#444444" } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}:focus-visible{background-image:linear-gradient(0deg,#111111,#444444)!important}}`));
  });

  test("a state that does not depend on the overridden parts adds nothing for the phone", () => {
    const out = css({ mobile: { gradAngle: 0 }, hover: { bg: "#112233" } });
    assert.ok(!out.includes(`${MOB}{${SEL}:hover`) && !out.includes(`{@media ${MOB}`));
  });
});

describe("a device override inherits what it does not set", () => {
  test("the border style and colour the width inherits", () => {
    const out = css({ borderWidth: 2, borderStyle: "dashed", borderColor: "#ff0000", mobile: { borderWidth: 4 } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}{border-style:dashed!important;border-width:4px!important;border-color:#ff0000!important}}`));
  });

  test("a phone width of zero still removes the border", () => {
    assert.ok(css({ borderWidth: 2, borderStyle: "dashed", mobile: { borderWidth: 0 } }).includes(`@media ${MOB}{${SEL}{border-style:none!important;border-width:0px!important}}`));
  });

  test("a phone image keeps the fit, position and repeat it inherits", () => {
    const out = css({ bgImage: "/a.png", bgFit: "contain", bgPosition: "left top", bgRepeat: "repeat-x", mobile: { bgImage: "/b.png" } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}{background-image:url("/b.png")!important;background-size:contain!important;background-position:left top!important;background-repeat:repeat-x!important}}`));
  });

  test("and uses its own where it sets one", () => {
    const out = css({ bgImage: "/a.png", bgFit: "contain", mobile: { bgImage: "/b.png", bgFit: "cover" } });
    assert.ok(out.includes("background-size:cover") && out.includes(`url("/b.png")`));
  });
});

describe("the scope is a block index", () => {
  test("anything else is refused instead of being written into a selector", () => {
    const s = { styles: { c: { opacity: 50 } } };
    for (const bad of ['0"]{}</style>', NaN, -1, 1.5, Infinity, null, undefined, "3", {}, []]) {
      assert.equal(stylesCss(s, bad as any), "", String(bad));
    }
  });

  test("a real index works, including zero", () => {
    assert.ok(stylesCss({ styles: { c: { opacity: 50 } } }, 0).startsWith(`[data-vb-s="0"]`));
    assert.ok(stylesCss({ styles: { c: { opacity: 50 } } }, 7).startsWith(`[data-vb-s="7"]`));
  });
});

describe("empty means empty", () => {
  test("a style made only of cleared fields renders nothing", () => {
    assert.equal(isEmptyStyle({ fontSize: null, padding: "", fontWeight: [] } as any), true);
  });
});
