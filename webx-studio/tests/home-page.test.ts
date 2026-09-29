// Which page the Visual Builder opens first (lib/homePage.ts).
//
// The Builder lists pages updatedAt:DESC and used to open list[0], so the
// most recently touched page became its landing page. A scratch draft left
// behind by an import test was therefore what greeted anyone opening the
// Builder for ORST, instead of that site's own front page. These tests pin
// the replacement rule down, including against the real page list that
// produced the report.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isHomeSlug, pickLandingPage } from "../lib/homePage";

describe("isHomeSlug", () => {
  test("matches a WordPress tenant-prefixed home slug", () => {
    assert.equal(isHomeSlug("orst-home", "orst"), true);
    assert.equal(isHomeSlug("royalsociety-home", "royalsociety"), true);
  });

  test("matches a bare home slug, the shape a Strapi page would carry", () => {
    assert.equal(isHomeSlug("home"), true);
    assert.equal(isHomeSlug("homepage"), true);
    assert.equal(isHomeSlug("index"), true);
  });

  test("is case-insensitive on both slug and tenant key", () => {
    assert.equal(isHomeSlug("ORST-Home", "Orst"), true);
  });

  test("only strips the prefix when it is THIS tenant's key", () => {
    // Belongs to orst, so royalsociety must not claim it as its own home.
    assert.equal(isHomeSlug("orst-home", "royalsociety"), false);
  });

  test("does not match a page that merely ends in the word home", () => {
    assert.equal(isHomeSlug("orst-nursing-home", "orst"), false);
    assert.equal(isHomeSlug("orst-home-care", "orst"), false);
  });

  test("an absent or empty slug is never home — the draft that caused this bug had none", () => {
    assert.equal(isHomeSlug(undefined, "orst"), false);
    assert.equal(isHomeSlug("", "orst"), false);
    assert.equal(isHomeSlug(null, "orst"), false);
    assert.equal(isHomeSlug("   ", "orst"), false);
  });

  test("works with no tenant key at all (unscoped session)", () => {
    assert.equal(isHomeSlug("home"), true);
    assert.equal(isHomeSlug("orst-home"), false); // nothing to strip, so no match
  });
});

describe("pickLandingPage", () => {
  // Trimmed from the live ORST list on 2026-09-29, in the Builder's own
  // updatedAt:DESC order. The empty-slug draft at the top is the page that
  // was being opened instead of the front page.
  const ORST = [
    { docId: "84", title: "พิสูจน์การนำเข้า", slug: undefined, tenantKey: "orst" },
    { docId: "12", title: "สถาบันความรู้ของชาติ", slug: "orst-home", tenantKey: "orst" },
    { docId: "83", title: "หน้าต้นทางพิสูจน์", slug: "orst-proof-source", tenantKey: "orst" },
    { docId: "5", title: "เกี่ยวกับเรา", slug: "orst-about", tenantKey: "orst" },
  ];

  test("picks the front page over the most recently edited one", () => {
    assert.equal(pickLandingPage(ORST, "orst")?.docId, "12");
  });

  test("falls back to list[0] when the tenant has no home page", () => {
    const noHome = ORST.filter((p) => p.slug !== "orst-home");
    assert.equal(pickLandingPage(noHome, "orst")?.docId, "84");
  });

  test("an empty list yields nothing rather than throwing", () => {
    assert.equal(pickLandingPage([], "orst"), undefined);
  });

  test("reads the tenant key off the page when the caller has none — an unscoped session lists every tenant", () => {
    const mixed = [
      { docId: "84", slug: undefined, tenantKey: "orst" },
      { docId: "13", slug: "royalsociety-home", tenantKey: "royalsociety" },
    ];
    assert.equal(pickLandingPage(mixed)?.docId, "13");
  });

  test("the caller's tenant key does not override a page's own", () => {
    // Guards the `p.tenantKey || tenantKey` precedence: a royalsociety page
    // in an orst-scoped list must still resolve against royalsociety.
    const mixed = [
      { docId: "80", slug: "orst-demo-import", tenantKey: "orst" },
      { docId: "13", slug: "royalsociety-home", tenantKey: "royalsociety" },
    ];
    assert.equal(pickLandingPage(mixed, "orst")?.docId, "13");
  });
});
