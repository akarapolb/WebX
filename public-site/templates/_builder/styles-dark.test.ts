import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="card"]`;
const DARK = `:where(:root[data-theme="dark"]) `;

describe("per-component dark mode", () => {
  test("dark values are scoped to dark mode and add no specificity", () => {
    const out = css({ card: { bg: "#ffffff", dark: { bg: "#111111" } } });
    assert.ok(out.includes(`${SEL}{background-color:#ffffff!important}`));
    assert.ok(out.includes(`${DARK}${SEL}{background-color:#111111!important}`));
  });

  test("the dark rule comes after the light one, so it wins by order", () => {
    const out = css({ card: { bg: "#ffffff", dark: { bg: "#111111" } } });
    assert.ok(out.indexOf(`${DARK}${SEL}`) > out.indexOf(`${SEL}{background-color:#ffffff`));
  });

  test("dark loses to a hover, which adds a pseudo-class", () => {
    const out = css({ card: { dark: { bg: "#111111" }, hover: { bg: "#222222" } } });
    assert.ok(out.indexOf(`:hover{background-color:#222222`) > out.indexOf(`${DARK}${SEL}`));
  });

  test("only what dark sets changes; the rest stays as it is", () => {
    const out = css({ card: { color: "#000000", bg: "#ffffff", dark: { color: "#eeeeee" } } });
    const dark = out.slice(out.indexOf(DARK));
    assert.ok(dark.includes("color:#eeeeee") && !dark.includes("background-color"));
  });

  test("dark text colour reaches the text and icons inside, behind the dark prefix", () => {
    const out = css({ card: { dark: { color: "#eeeeee", iconColor: "#ffcc00" } } });
    assert.ok(out.includes(`${DARK}${SEL} :not([data-vb-c]):not(svg):not(svg *){color:#eeeeee!important}`));
    assert.ok(out.includes(`${DARK}${SEL} svg,${DARK}${SEL} svg *{color:#eeeeee!important}`));
    // The icon rule's repeated selector must keep the dark prefix in front, not splice it into the middle.
    assert.ok(out.includes(`${DARK}${SEL}${SEL} svg,${DARK}${SEL}${SEL} svg *{color:#ffcc00!important}`));
    assert.ok(!out.includes(`${SEL}${DARK}`));
  });

  test("theme tokens work in dark mode (they already follow it, so this is for exceptions)", () => {
    assert.ok(css({ card: { dark: { bg: "@ink", color: "@ground" } } }).includes("background-color:var(--wx-c-ink)"));
  });

  test("dark can swap a gradient or image without restating the rest", () => {
    const out = css({ card: { bgImage: "/p.jpg", gradFrom: "#111111", gradTo: "#222222", dark: { gradFrom: "#eeeeee" } } });
    assert.ok(out.includes(`${DARK}${SEL}{background-image:linear-gradient(180deg,#eeeeee,#222222),url("/p.jpg")!important}`));
  });

  test("dark text/typography and shadow settings are honoured too", () => {
    const out = css({ card: { dark: { opacity: 80, shadowBlur: 20, shadowColor: "#ffffff33" } } });
    assert.ok(out.includes("opacity:0.8") && out.includes("box-shadow:0px 4px 20px 0px #ffffff33"));
  });

  test("nothing nested is read from inside dark", () => {
    const out = css({ card: { dark: { hover: { bg: "#112233" }, mobile: { bg: "#445566" }, dark: { bg: "#778899" }, opacity: 70 } } });
    assert.ok(out.includes("opacity:0.7") && !/112233|445566|778899/.test(out));
  });

  test("dark alone makes a style non-empty; an empty or bad one does not", () => {
    assert.equal(isEmptyStyle({ dark: { bg: "#111111" } } as any), false);
    assert.equal(isEmptyStyle({ dark: {} } as any), true);
    assert.equal(isEmptyStyle({ dark: { bg: "red" } } as any), true);
    assert.equal(isEmptyStyle({ dark: "x" } as any), true);
    assert.equal(isEmptyStyle({ dark: [1] } as any), true);
  });

  test("hostile values in dark are dropped", () => {
    const evil = `red;}</style><script>alert(1)</script>`;
    assert.equal(css({ card: { dark: { bg: evil, color: evil, iconColor: evil, bgImage: evil, borderColor: evil, shadow: evil } } }), "");
  });
});
