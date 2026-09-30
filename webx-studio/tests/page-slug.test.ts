// The slug a new WordPress page is created with (lib/pageSlug.ts).
//
// A page without the "<tenant>-" prefix is invisible to the public site —
// public-site's listWpPageSlugs only enumerates prefixed slugs — so it saves
// fine and never gets a URL. These tests pin the prefix and the ASCII rule.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { slugify, wpPageSlug } from "../lib/pageSlug";

describe("slugify", () => {
  test("lower-cases and hyphenates plain words", () => {
    assert.equal(slugify("Annual Report 2026"), "annual-report-2026");
  });

  test("collapses runs of punctuation and trims the ends", () => {
    assert.equal(slugify("  --Hello,   World!!--  "), "hello-world");
  });

  test("strips accents from Latin letters rather than dropping the letter", () => {
    assert.equal(slugify("Café Société"), "cafe-societe");
  });

  test("drops Thai entirely — it cannot be part of a plain slug", () => {
    assert.equal(slugify("บริการประชาชน"), "");
  });

  test("keeps the ASCII part of a mixed title", () => {
    assert.equal(slugify("ข่าว News 2026"), "news-2026");
  });

  test("caps the length and never ends on a hyphen after the cut", () => {
    const out = slugify("a".repeat(30) + " " + "b".repeat(30));
    assert.ok(out.length <= 40, out);
    assert.equal(out.endsWith("-"), false, out);
  });

  test("returns empty for empty, whitespace and non-strings", () => {
    for (const v of ["", "   ", "!!!", null as any, undefined as any, 42 as any]) {
      assert.equal(typeof slugify(v), "string");
    }
    assert.equal(slugify(""), "");
    assert.equal(slugify("!!!"), "");
  });

  test("output only ever contains [a-z0-9-], so it passes the public route's slug check", () => {
    for (const t of ["Hello/World", "a b", "x?y=1", "../etc", "<script>", "Ünïcödé"]) {
      assert.match(slugify(t) || "x", /^[a-z0-9-]+$/, t);
    }
  });
});

describe("wpPageSlug", () => {
  const fixed = () => "ab12";

  test("prefixes the workspace key — the thing that makes the page routable", () => {
    assert.equal(wpPageSlug("orst", "About us", fixed), "orst-about-us");
    assert.equal(wpPageSlug("royalsociety", "Contact", fixed), "royalsociety-contact");
  });

  test("a Thai-only title still gets a valid, unique slug", () => {
    assert.equal(wpPageSlug("orst", "บริการประชาชน", fixed), "orst-page-ab12");
  });

  test("two Thai-titled pages do not collide", () => {
    let n = 0;
    const seq = () => "s" + n++;
    assert.notEqual(wpPageSlug("orst", "หน้าแรก", seq), wpPageSlug("orst", "หน้าแรก", seq));
  });

  test("normalises the workspace key too", () => {
    assert.equal(wpPageSlug("ORST", "About", fixed), "orst-about");
  });

  test("refuses to build a slug with no workspace — an orphan page would have no route", () => {
    assert.throws(() => wpPageSlug("", "About", fixed), /workspace/i);
    assert.throws(() => wpPageSlug("   ", "About", fixed), /workspace/i);
  });

  test("the result starts with the prefix the public site filters on", () => {
    // listWpPageSlugs keeps only `${tenant}-…` and strips that prefix to get
    // the route's [page] param — so what remains must be non-empty.
    const slug = wpPageSlug("orst", "Hello", fixed);
    assert.ok(slug.startsWith("orst-"));
    assert.ok(slug.slice("orst-".length).length > 0);
  });
});
