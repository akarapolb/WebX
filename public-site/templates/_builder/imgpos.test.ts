// Dragging a picture in the Visual Builder to choose the part of it that shows.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parsePos, overflowOf, dragPos, zoomOf } from "./HarnessBridge";
import { positionCss, stylesCss, imgPositionDecls } from "./styles";

describe("picture position — the drag", () => {
  test("reads a computed position, the centre when it is not in percent", () => {
    assert.deepEqual(parsePos("30% 75%"), [30, 75]);
    assert.deepEqual(parsePos("center center"), [50, 50]);
    assert.deepEqual(parsePos("120% -5%"), [100, 0]);
  });
  test("a wide picture in a tall box can only move sideways", () => {
    const [ovX, ovY] = overflowOf(400, 400, 2000, 1000, "cover"); // scaled to 800×400
    assert.equal(ovX, 400); assert.equal(ovY, 0);
  });
  test("a picture shown whole (contain) cannot be dragged", () => {
    assert.deepEqual(overflowOf(400, 400, 2000, 1000, "contain"), [0, 0]);
  });
  test("dragging right shows more of the left side, and stops at the edge", () => {
    assert.deepEqual(dragPos(50, 50, 100, 30, 400, 0), [25, 50]);
    assert.deepEqual(dragPos(50, 50, 1000, 0, 400, 0), [0, 50]);
    assert.deepEqual(dragPos(50, 50, -1000, 0, 400, 0), [100, 50]);
  });
});

describe("picture position — the saved style", () => {
  test("an exact spot or one of the nine anchors; nothing else", () => {
    assert.equal(positionCss("30% 75.5%"), "30% 75.5%");
    assert.equal(positionCss("left top"), "left top");
    for (const bad of ["101% 5%", "30%", "30% 75%;color:red", "calc(1px) 5%", 42, null]) assert.equal(positionCss(bad), undefined, String(bad));
  });
  test("moves the component's own photo and its background, not a photo of a part inside it", () => {
    const css = stylesCss({ styles: { section: { bgPosition: "20% 80%" } } }, 0);
    assert.match(css, /background-position|object-position/);
    assert.match(css, /\[data-vb-s="0"\]\[data-vb-c="section"\] img:not\(\[data-vb-s="0"\]\[data-vb-c="section"\] \[data-vb-c\] img\)\{object-position:20% 80%!important\}/);
  });
  test("zoomed in: scaled about the chosen spot and clipped back to its own box", () => {
    const d = imgPositionDecls("0% 50%", 2);
    assert.match(d, /transform:scale\(2\)!important/);
    assert.match(d, /transform-origin:0% 50%!important/);
    // origin at the left edge: nothing clipped on the left, half the scaled width on the right
    assert.match(d, /clip-path:inset\(25% 50% 25% 0%\)!important/);
  });
  test("zoom 1, below 1 or not a number adds no scale; too much is held at 4", () => {
    for (const z of [1, 0.5, "x", undefined]) assert.doesNotMatch(imgPositionDecls("50% 50%", z), /scale/, String(z));
    assert.match(imgPositionDecls("50% 50%", 9), /scale\(4\)/);
  });
  test("reads the zoom back from a computed transform", () => {
    assert.equal(zoomOf("matrix(1.52, 0, 0, 1.52, 0, 0)"), 1.52);
    assert.equal(zoomOf("none"), 1);
  });
  test("a bad value writes no picture rule", () => {
    assert.doesNotMatch(stylesCss({ styles: { section: { bgPosition: "20% 80%;}body{display:none" } } }, 0), /object-position/);
  });
});
