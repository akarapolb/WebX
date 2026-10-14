import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle, DEVICES } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="heading"]`;
const TAB = "(max-width: 1023.98px)";
const MOB = "(max-width: 639.98px)";

describe("per-device style overrides", () => {
  test("the base style stays outside any media query", () => {
    const out = css({ heading: { fontSize: 40, tablet: { fontSize: 30 }, mobile: { fontSize: 22 } } });
    assert.ok(out.startsWith(`${SEL}{font-size:40px!important;line-height:1.25!important}`));
  });

  test("tablet applies from 1023px down, mobile from 639px down, mobile last so it wins", () => {
    const out = css({ heading: { fontSize: 40, tablet: { fontSize: 30 }, mobile: { fontSize: 22 } } });
    const t = out.indexOf(`@media ${TAB}{${SEL}{font-size:30px`);
    const m = out.indexOf(`@media ${MOB}{${SEL}{font-size:22px`);
    assert.ok(t > 0 && m > t, out);
  });

  test("an override only changes what it sets", () => {
    const out = css({ heading: { color: "#111111", bg: "#eeeeee", mobile: { color: "#ffffff" } } });
    const media = out.slice(out.indexOf("@media"));
    assert.ok(media.includes("color:#ffffff"));
    assert.ok(!media.includes("background-color"));
  });

  test("a spacing override uses the unit it inherits, unless it sets its own", () => {
    const out = css({ heading: { unit: "rem", paddingTop: 2, mobile: { paddingTop: 1 } } });
    assert.ok(out.includes(`${SEL}{padding-top:2rem!important}`));
    assert.ok(out.includes(`@media ${MOB}{${SEL}{padding-top:1rem!important}}`));
    const own = css({ heading: { unit: "rem", paddingTop: 2, mobile: { unit: "px", paddingTop: 8 } } });
    assert.ok(own.includes(`@media ${MOB}{${SEL}{padding-top:8px!important}}`));
  });

  test("the phone follows the tablet's unit before the base one", () => {
    const out = css({ heading: { unit: "rem", paddingTop: 2, tablet: { unit: "em" }, mobile: { paddingTop: 3 } } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}{padding-top:3em!important}}`));
  });

  test("a background position set alone, on a device, applies to the base image", () => {
    const out = css({ heading: { bgImage: "/a.png", mobile: { bgPosition: "left top", bgFit: "contain" } } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}{background-size:contain!important;background-position:left top!important}}`));
    // ...but the base style alone still emits nothing for a lone position without an image
    assert.ok(!css({ heading: { bgPosition: "left top" } }).includes("background-position"));
  });

  test("a border colour set alone, on a device, applies to the base border", () => {
    const out = css({ heading: { borderWidth: 2, mobile: { borderColor: "#abcdef" } } });
    assert.ok(out.includes(`@media ${MOB}{${SEL}{border-color:#abcdef!important}}`));
    assert.ok(!css({ heading: { borderColor: "#abcdef" } }).includes("border-color"));
  });

  test("a device text colour reaches the text and icons inside, inside the media query", () => {
    const out = css({ heading: { tablet: { color: "#ff0000", iconColor: "#00ff00" } } });
    assert.ok(out.includes(`@media ${TAB}{${SEL}{color:#ff0000!important}${SEL} :not([data-vb-c]):not(svg):not(svg *){color:#ff0000!important}`));
    assert.ok(out.includes(`${SEL}${SEL} svg,${SEL}${SEL} svg *{color:#00ff00!important}`));
  });

  test("a style with only a device override is not empty; an empty or bad override is", () => {
    assert.equal(isEmptyStyle({ mobile: { opacity: 50 } } as any), false);
    assert.equal(isEmptyStyle({ mobile: {} } as any), true);
    assert.equal(isEmptyStyle({ mobile: { bg: "red" } } as any), true);
    assert.equal(isEmptyStyle({ mobile: "x", tablet: [1] } as any), true);
  });

  test("states and further overrides inside an override are ignored", () => {
    const out = css({ heading: { mobile: { hover: { bg: "#112233" }, tablet: { bg: "#445566" }, mobile: { bg: "#778899" }, opacity: 70 } } });
    assert.ok(out.includes("opacity:0.7"));
    assert.ok(!/hover|112233|445566|778899/.test(out));
  });

  test("hostile values in an override are dropped like anywhere else", () => {
    const evil = `red;}</style><script>alert(1)</script>`;
    assert.equal(css({ heading: { tablet: { bg: evil, color: evil, bgImage: evil, shadow: evil, borderColor: evil, bgPosition: evil, borderStyle: evil } } }), "");
  });

  test("the device list is exactly what the Studio offers", () => {
    assert.deepEqual([...DEVICES], ["tablet", "mobile"]);
  });
});
