// publicPath decides which URLs we tell search engines a page lives at. Wrong
// in either direction hurts: stripping too much points canonicals at pages
// that don't exist, stripping too little leaves them pointing at a redirect.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { publicPath } from "./seo";

const KEY = "PUBLIC_SITE_ROOT_TENANTS";
let saved: string | undefined;
beforeEach(() => { saved = process.env[KEY]; });
afterEach(() => { if (saved === undefined) delete process.env[KEY]; else process.env[KEY] = saved; });

describe("publicPath — tenant served from its domain root", () => {
  beforeEach(() => { process.env[KEY] = "orst"; });

  test("drops the tenant segment", () => {
    assert.equal(publicPath("orst", "/orst/about"), "/about");
    assert.equal(publicPath("orst", "/orst/feed.xml"), "/feed.xml");
    assert.equal(publicPath("orst", "/orst/news"), "/news");
  });

  test("the tenant's home becomes the domain root, not an empty string", () => {
    assert.equal(publicPath("orst", "/orst"), "/");
  });

  test("keeps the English locale prefix", () => {
    assert.equal(publicPath("orst", "/en/orst/about"), "/en/about");
    assert.equal(publicPath("orst", "/en/orst"), "/en");
  });

  test("keeps a query or fragment", () => {
    assert.equal(publicPath("orst", "/orst/search?q=ก"), "/search?q=ก");
    assert.equal(publicPath("orst", "/orst#top"), "/#top");
  });

  test("does not touch a path that merely starts with the same letters", () => {
    assert.equal(publicPath("orst", "/orstx/about"), "/orstx/about");
    assert.equal(publicPath("orst", "/about/orst"), "/about/orst");
  });

  test("does not touch another tenant's paths", () => {
    assert.equal(publicPath("orst", "/royalsociety/about"), "/royalsociety/about");
  });
});

describe("publicPath — opt-in only", () => {
  test("unchanged when the env var is unset (local dev)", () => {
    delete process.env[KEY];
    assert.equal(publicPath("orst", "/orst/about"), "/orst/about");
  });

  test("unchanged for a tenant that is not listed", () => {
    process.env[KEY] = "royalsociety";
    assert.equal(publicPath("orst", "/orst/about"), "/orst/about");
  });

  test("handles a comma list with spaces", () => {
    process.env[KEY] = " orst , royalsociety ";
    assert.equal(publicPath("royalsociety", "/royalsociety/about"), "/about");
    assert.equal(publicPath("orst", "/orst/about"), "/about");
  });

  test("a tenant key with regex characters cannot widen the match", () => {
    process.env[KEY] = "a.b";
    assert.equal(publicPath("a.b", "/axb/about"), "/axb/about");
    assert.equal(publicPath("a.b", "/a.b/about"), "/about");
  });
});
