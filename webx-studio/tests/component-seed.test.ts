// What "Add component" puts in a newly added field (components/BlockComponents.tsx).
//
// Every template renders these conditionally — `{b.eyebrow ? <span/> : null}`
// — so a component seeded with "" is added to the editor and changes nothing
// on the preview, which reads as the button not working. These tests pin the
// rule that the seed must be something the page will actually draw.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { seedField } from "../components/BlockComponents";
import type { ItemField } from "../lib/blockCatalog";

const f = (o: Partial<ItemField> & { k: string }): ItemField => o as ItemField;

describe("seedField", () => {
  test("a plain text field is seeded with its own key, never empty", () => {
    assert.equal(seedField(f({ k: "eyebrow" })), "eyebrow");
    assert.equal(seedField(f({ k: "heading" })), "heading");
  });

  test("a textarea field is seeded too — same conditional render applies", () => {
    assert.equal(seedField(f({ k: "body", ta: true })), "body");
  });

  test("a select takes its first option, which is a real choice", () => {
    assert.equal(seedField(f({ k: "tone", select: ["info", "warn", "bad"] })), "info");
  });

  test("an icon field gets a real symbol id, not an empty <use href=\"#\">", () => {
    assert.equal(seedField(f({ k: "icon", icon: true })), "i-check");
  });

  test("a link field gets an inert target rather than a dead empty href", () => {
    for (const k of ["href", "url", "link", "HREF", "ctaHref"]) {
      assert.equal(seedField(f({ k })), "#", k);
    }
  });

  test("a field merely containing those words is still seeded as text", () => {
    // "linkLabel" is the visible text of a link, not its target.
    assert.equal(seedField(f({ k: "linkLabel" })), "linkLabel");
    assert.equal(seedField(f({ k: "urlLabel" })), "urlLabel");
  });

  test("select wins over every other rule — its value set is closed", () => {
    assert.equal(seedField(f({ k: "href", select: ["a", "b"] })), "a");
    assert.equal(seedField(f({ k: "icon", icon: true, select: ["i-a"] })), "i-a");
  });

  test("nothing is ever seeded empty, which is the bug this replaced", () => {
    for (const k of ["a", "eyebrow", "href", "icon", "body"]) {
      const v = seedField(f({ k }));
      assert.notEqual(v, "", k);
      assert.ok(typeof v === "string" && v.length > 0, k);
    }
  });
});
