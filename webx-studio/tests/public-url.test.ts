// Where a published entry can be read on the public site (lib/publicUrl.ts).
//
// These paths become clickable links on a release, so the failure that
// matters is a link that looks right and 404s. The two engines shape their
// slugs differently — WordPress keeps every tenant in one site and prefixes
// them, Strapi scopes by relation — and each has its own "this one is the
// homepage" slug, so the mapping is pinned against both.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { publicPagePath, publicPageUrl, tenantKeyOf } from "../lib/publicUrl";

describe("tenantKeyOf", () => {
  test("reads the flat key a WordPress page carries", () => {
    assert.equal(tenantKeyOf({ tenantKey: "orst" }), "orst");
  });

  test("reads a populated Strapi relation", () => {
    assert.equal(tenantKeyOf({ tenant: { key: "dga" } }), "dga");
  });

  test("reads a relation that came back as a bare key", () => {
    assert.equal(tenantKeyOf({ tenant: "pea" }), "pea");
  });

  test("prefers the flat key when both are present", () => {
    assert.equal(tenantKeyOf({ tenantKey: "orst", tenant: { key: "dga" } }), "orst");
  });

  test("gives up rather than guessing", () => {
    for (const e of [null, undefined, {}, { tenant: null }, { tenant: {} }, { tenantKey: "" }]) {
      assert.equal(tenantKeyOf(e as any), null, JSON.stringify(e));
    }
  });
});

describe("publicPagePath — WordPress pages", () => {
  test("strips the tenant prefix the route's own param does not include", () => {
    assert.equal(publicPagePath("wp:page", { slug: "orst-about", tenantKey: "orst" }), "/orst/about");
    assert.equal(publicPagePath("wp:page", { slug: "royalsociety-services", tenantKey: "royalsociety" }), "/royalsociety/services");
  });

  test("the tenant's own home page is the tenant root, not a child path", () => {
    assert.equal(publicPagePath("wp:page", { slug: "orst-home", tenantKey: "orst" }), "/orst");
  });

  test("refuses a slug belonging to another tenant", () => {
    // Would otherwise produce /royalsociety/about from an ORST page.
    assert.equal(publicPagePath("wp:page", { slug: "orst-about", tenantKey: "royalsociety" }), null);
  });

  test("refuses a slug that is only the prefix", () => {
    assert.equal(publicPagePath("wp:page", { slug: "orst-", tenantKey: "orst" }), null);
  });

  test("keeps multi-word page slugs intact", () => {
    assert.equal(publicPagePath("wp:page", { slug: "orst-about-us", tenantKey: "orst" }), "/orst/about-us");
  });
});

describe("publicPagePath — Strapi pages", () => {
  test("maps a slug under its tenant", () => {
    assert.equal(publicPagePath("api::page.page", { slug: "services", tenant: { key: "dga" } }), "/dga/services");
  });

  test("the home-blocks slug is the tenant root", () => {
    assert.equal(publicPagePath("api::page.page", { slug: "home-blocks", tenant: { key: "dga" } }), "/dga");
  });

  test("does not strip a tenant prefix here — Strapi slugs do not carry one", () => {
    assert.equal(publicPagePath("api::page.page", { slug: "dga-services", tenant: { key: "dga" } }), "/dga/dga-services");
  });
});

describe("publicPagePath — when there is no link to give", () => {
  test("a content type with no guaranteed public route gets none", () => {
    // Collection detail routes exist only where the tenant has configured a
    // collection page, so a guess here would 404.
    for (const uid of ["api::article.article", "api::service.service", "wp:document", "api::landing.landing"]) {
      assert.equal(publicPagePath(uid, { slug: "x", tenantKey: "orst" }), null, uid);
    }
  });

  test("a missing tenant or slug yields null, not a half-built path", () => {
    assert.equal(publicPagePath("wp:page", { slug: "orst-about" }), null);
    assert.equal(publicPagePath("api::page.page", { tenant: { key: "dga" } }), null);
    assert.equal(publicPagePath("api::page.page", { slug: "   ", tenant: { key: "dga" } }), null);
    assert.equal(publicPagePath(null, { slug: "a", tenantKey: "orst" }), null);
    assert.equal(publicPagePath("wp:page", null), null);
  });

  test("rejects anything that is not a plain slug, so a link can't carry a path of its own", () => {
    for (const slug of ["../admin", "a/b", "a b", "a?x=1", "a#b", "%2e%2e"]) {
      assert.equal(publicPagePath("api::page.page", { slug, tenant: { key: "dga" } }), null, slug);
    }
    for (const tenant of ["../x", "a/b", "a b"]) {
      assert.equal(publicPagePath("api::page.page", { slug: "ok", tenant: { key: tenant } }), null, tenant);
    }
  });
});

describe("publicPageUrl", () => {
  test("joins onto an origin", () => {
    assert.equal(publicPageUrl("http://localhost:3100", "/orst/about"), "http://localhost:3100/orst/about");
  });

  test("tolerates a trailing slash on the base", () => {
    assert.equal(publicPageUrl("https://example.go.th/", "/orst"), "https://example.go.th/orst");
    assert.equal(publicPageUrl("https://example.go.th///", "/orst"), "https://example.go.th/orst");
  });
});
