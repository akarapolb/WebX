// WebX site kit: URL scheme, static search, public CMS rule, search index words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineSite } from "@/lib/site/config";
import { queryTerms, searchDocs, snippetParts, type SearchDoc } from "@/lib/site/search";
import { blockWords } from "@/lib/site/searchIndex";
import { publicCmsUrl } from "@/lib/publicCmsRule.mjs";

test("defineSite gives the TH/EN URL scheme", () => {
  const s = defineSite({ tenant: "hub", homeSlug: "home-blocks" });
  assert.equal(s.pathOf("th"), "/hub");
  assert.equal(s.pathOf("th", "home-blocks"), "/hub");
  assert.equal(s.pathOf("en", "about"), "/en/hub/about");
  assert.equal(s.searchIndexPath("en"), "/en/hub/search-index.json");
  assert.equal(s.newsPath("th", "x"), "/hub/news/x");
  assert.equal(s.dataPath("en"), "/en/hub/data");
  assert.equal(defineSite({ tenant: "t" }).homeSlug, "home");
});

const docs: SearchDoc[] = [
  { u: "/hub/indices", t: "ดัชนีสากล", s: "ดัชนีสากล", x: "UN EGDI คะแนน 0.7732 อันดับ 72" },
  { u: "/hub/open-data", t: "ข้อมูลเปิด", s: "ข้อมูลเปิด", x: "ดาวน์โหลด CSV EGDI GTMI" },
  { u: "/hub/about", t: "EGDI explained", s: "About", x: "what the index measures" },
];

test("search: every term must match, title matches rank first, Thai substrings work", () => {
  assert.deepEqual(searchDocs(docs, queryTerms("egdi")).map((r) => r.d.u)[0], "/hub/about");
  assert.deepEqual(searchDocs(docs, queryTerms("EGDI csv")).map((r) => r.d.u), ["/hub/open-data"]);
  assert.deepEqual(searchDocs(docs, queryTerms("อันดับ")).map((r) => r.d.u), ["/hub/indices"], "no word breaks needed in Thai");
  assert.deepEqual(searchDocs(docs, queryTerms("nothing-here")), []);
  assert.deepEqual(searchDocs(docs, []), []);
});

test("snippet marks matches and cuts long text with ellipses", () => {
  const long = "a".repeat(200) + " EGDI " + "b".repeat(200);
  const s = snippetParts(long, ["egdi"]);
  assert.ok(s.before && s.after);
  assert.equal(s.parts[1], "EGDI");
  const none = snippetParts("short text", ["zzz"]);
  assert.deepEqual(none, { parts: ["short text"], before: false, after: false });
});

test("search index takes reader-visible words, not settings or links", () => {
  const words = blockWords([{ __component: "block.cta-banner", heading: "Open data", buttonUrl: "/x", colorTheme: "dark", text: "<p>Download <b>CSV</b></p>" }]);
  assert.deepEqual(words.map((w) => w.replace(/\s+/g, " ").trim()), ["Open data", "Download CSV"]);
});

test("public CMS rule: local CMS on a public site is switched off", () => {
  assert.equal(publicCmsUrl({}), "http://localhost:1337", "local dev keeps working");
  assert.equal(publicCmsUrl({ PUBLIC_SITE_URL: "https://hub.example.org" }), "", "no localhost in a public build");
  assert.equal(publicCmsUrl({ STRAPI_URL: "https://cms.example.org/", PUBLIC_SITE_URL: "https://hub.example.org" }), "https://cms.example.org");
  assert.equal(publicCmsUrl({ PUBLIC_CMS_URL: "https://api.example.org", PUBLIC_SITE_URL: "https://hub.example.org" }), "https://api.example.org");
  assert.equal(publicCmsUrl({ PUBLIC_CMS_URL: "off" }), "");
});
