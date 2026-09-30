// resolveIcons swaps a tenant's icon keys into a block tree before it renders
// (templates/_builder/resolveIcons.ts). The templates read icons in sixteen
// places, so getting this wrong either loses icons silently or — worse —
// rewrites something that was never an icon reference.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveIcons, type IconLibrary } from "./resolveIcons";

const LIB: IconLibrary = {
  "mui-search": { svg: '<path d="M1 2"/>', viewBox: "0 0 24 24" },
  "my-logo": { imageUrl: "/uploads/logo.png" },
};

describe("resolveIcons", () => {
  test("replaces a key that names an icon in the library", () => {
    const out = resolveIcons({ icon: "mui-search" }, LIB);
    assert.deepEqual(out, { icon: LIB["mui-search"] });
  });

  test("leaves a sprite id alone — it is not in the library", () => {
    const b = { icon: "i-shield" };
    assert.equal(resolveIcons(b, LIB), b, "should be the same object, not a copy");
  });

  test("reaches icons nested in items and in items of items", () => {
    const out: any = resolveIcons(
      { items: [{ icon: "i-grid" }, { icon: "mui-search", tabs: [{ icon: "my-logo" }] }] },
      LIB
    );
    assert.equal(out.items[0].icon, "i-grid");
    assert.deepEqual(out.items[1].icon, LIB["mui-search"]);
    assert.deepEqual(out.items[1].tabs[0].icon, LIB["my-logo"]);
  });

  test("only the `icon` key is treated as a reference", () => {
    // A heading that happens to read "mui-search" is text, not an icon.
    const out: any = resolveIcons({ heading: "mui-search", iconLabel: "mui-search" }, LIB);
    assert.equal(out.heading, "mui-search");
    assert.equal(out.iconLabel, "mui-search");
  });

  test("is idempotent — an already-resolved definition is left as it is", () => {
    const once: any = resolveIcons({ icon: "mui-search" }, LIB);
    const twice: any = resolveIcons(once, LIB);
    assert.equal(twice, once);
  });

  test("returns the input untouched when nothing resolves, so the common case allocates nothing", () => {
    const b = { heading: "x", items: [{ icon: "i-a" }, { icon: "i-b" }] };
    assert.equal(resolveIcons(b, LIB), b);
  });

  test("no library means no work at all", () => {
    const b = { icon: "mui-search" };
    assert.equal(resolveIcons(b, undefined), b);
  });

  test("leaves non-objects and nulls alone", () => {
    assert.equal(resolveIcons(null, LIB), null);
    assert.equal(resolveIcons("x", LIB), "x");
    assert.equal(resolveIcons(7, LIB), 7);
  });

  test("stops at a depth limit rather than walking a pathological tree", () => {
    // 12 levels deep — past MAX_DEPTH, so the innermost icon is left as a key.
    let node: any = { icon: "mui-search" };
    for (let i = 0; i < 12; i++) node = { child: node };
    let out: any = resolveIcons(node, LIB);
    for (let i = 0; i < 12; i++) out = out.child;
    assert.equal(out.icon, "mui-search");
  });

  test("a shallow icon still resolves in that same deep tree", () => {
    const out: any = resolveIcons({ icon: "mui-search", child: { child: { icon: "my-logo" } } }, LIB);
    assert.deepEqual(out.icon, LIB["mui-search"]);
    assert.deepEqual(out.child.child.icon, LIB["my-logo"]);
  });
});
