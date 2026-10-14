import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stylesCss, isEmptyStyle } from "./styles";

const css = (styles: any) => stylesCss({ styles }, 0);
const SEL = `[data-vb-s="0"][data-vb-c="hero"]`;

describe("gradient backgrounds", () => {
  test("a linear gradient with two colours and an angle", () => {
    assert.ok(css({ hero: { gradFrom: "#112233", gradTo: "#445566", gradAngle: 135 } })
      .includes(`${SEL}{background-image:linear-gradient(135deg,#112233,#445566)!important}`));
  });

  test("defaults to top-to-bottom (180deg) and accepts theme tokens", () => {
    assert.ok(css({ hero: { gradFrom: "@primary", gradTo: "@c2" } })
      .includes("background-image:linear-gradient(180deg,var(--wx-c-primary),var(--wx-c-c2))!important"));
  });

  test("radial ignores the angle", () => {
    assert.ok(css({ hero: { gradType: "radial", gradAngle: 45, gradFrom: "#ffffff", gradTo: "#000000" } })
      .includes("background-image:radial-gradient(circle at center,#ffffff,#000000)!important"));
  });

  test("one colour only fades to transparent", () => {
    assert.ok(css({ hero: { gradFrom: "#112233" } }).includes("linear-gradient(180deg,#112233,transparent)"));
    assert.ok(css({ hero: { gradTo: "#112233" } }).includes("linear-gradient(180deg,transparent,#112233)"));
  });

  test("the angle is clamped, and a non-number falls back to the default", () => {
    assert.ok(css({ hero: { gradFrom: "#111111", gradTo: "#222222", gradAngle: 9999 } }).includes("linear-gradient(360deg"));
    assert.ok(css({ hero: { gradFrom: "#111111", gradTo: "#222222", gradAngle: -50 } }).includes("linear-gradient(0deg"));
    assert.ok(css({ hero: { gradFrom: "#111111", gradTo: "#222222", gradAngle: "x" } }).includes("linear-gradient(180deg"));
  });

  test("layers are overlay, then gradient, then the image — a translucent gradient tints the photo", () => {
    const out = css({ hero: { bgImage: "/p.jpg", bgOverlay: "#00000080", gradFrom: "#ff000080", gradTo: "#0000ff80" } });
    assert.ok(out.includes(`background-image:linear-gradient(#00000080,#00000080),linear-gradient(180deg,#ff000080,#0000ff80),url("/p.jpg")!important`));
    assert.ok(out.includes("background-size:cover"));
  });

  test("a gradient alone emits no image size/position/repeat", () => {
    const out = css({ hero: { gradFrom: "#111111", gradTo: "#222222" } });
    assert.ok(!/background-size|background-position|background-repeat/.test(out));
  });

  test("an overlay can tint a gradient too, but alone it still has nothing to cover", () => {
    assert.ok(css({ hero: { bgOverlay: "#00000080", gradFrom: "#111111", gradTo: "#222222" } }).includes("linear-gradient(#00000080,#00000080),linear-gradient(180deg"));
    assert.equal(css({ hero: { bgOverlay: "#00000080" } }), "");
  });

  test("hostile gradient values are dropped", () => {
    const evil = `red);}</style><script>alert(1)</script>`;
    assert.equal(css({ hero: { gradFrom: evil, gradTo: evil, gradAngle: evil, gradType: evil } }), "");
    assert.ok(css({ hero: { gradFrom: "#111111", gradTo: evil, gradType: evil } }).includes("linear-gradient(180deg,#111111,transparent)"));
  });

  test("a gradient alone makes a style non-empty", () => {
    assert.equal(isEmptyStyle({ gradFrom: "#111111" } as any), false);
    assert.equal(isEmptyStyle({ gradAngle: 90 } as any), true);
  });
});

describe("gradients in states and on devices", () => {
  test("hover swaps the gradient colours and keeps the main angle and image", () => {
    const out = css({ hero: { bgImage: "/p.jpg", gradFrom: "#111111", gradTo: "#222222", gradAngle: 90, hover: { gradFrom: "#ff0000", gradTo: "#00ff00" } } });
    assert.ok(out.includes(`@media (hover:hover){${SEL}:hover{background-image:linear-gradient(90deg,#ff0000,#00ff00),url("/p.jpg")!important}}`));
  });

  test("a hover that sets one colour keeps the other from the main style", () => {
    const out = css({ hero: { gradFrom: "#111111", gradTo: "#222222", hover: { gradTo: "#ff0000" } } });
    assert.ok(out.includes(`:hover{background-image:linear-gradient(180deg,#111111,#ff0000)!important}`));
  });

  test("a hover gradient with no gradient to build on is ignored when nothing resolves", () => {
    assert.equal(css({ hero: { hover: { gradFrom: "nope" } } }), "");
  });

  test("a mobile gradient is stacked over the image it inherits", () => {
    const out = css({ hero: { bgImage: "/p.jpg", mobile: { gradFrom: "#111111", gradTo: "#222222" } } });
    assert.ok(out.includes(`@media (max-width: 639.98px){${SEL}{background-image:linear-gradient(180deg,#111111,#222222),url("/p.jpg")!important}}`));
  });

  test("a device can turn the gradient round without restating its colours", () => {
    const out = css({ hero: { gradFrom: "#111111", gradTo: "#222222", gradAngle: 90, mobile: { gradType: "radial" }, tablet: { gradAngle: 45 } } });
    assert.ok(out.includes("@media (max-width: 1023.98px){" + SEL + "{background-image:linear-gradient(45deg,#111111,#222222)!important}}"));
    // the phone follows the tablet's angle until it changes type, and radial then ignores the angle
    assert.ok(out.includes("@media (max-width: 639.98px){" + SEL + "{background-image:radial-gradient(circle at center,#111111,#222222)!important}}"));
  });

  test("an override that leaves the layers alone does not re-emit them", () => {
    const out = css({ hero: { bgImage: "/p.jpg", gradFrom: "#111111", gradTo: "#222222", mobile: { opacity: 50 } } });
    assert.ok(out.includes("@media (max-width: 639.98px){" + SEL + "{opacity:0.5!important}}"));
  });

  test("a device does not reset the base image's own position and fit", () => {
    const out = css({ hero: { bgImage: "/p.jpg", bgPosition: "left top", mobile: { gradFrom: "#111111", gradTo: "#222222" } } });
    const media = out.slice(out.indexOf("@media"));
    assert.ok(!/background-position|background-size|background-repeat/.test(media));
  });
});
