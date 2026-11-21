// The post-build check (scripts/check-export.mjs) fails a build with a broken
// page: it is the last step of `npm run build`, so a non-zero exit stops it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkExport } from "../scripts/check-export.mjs";

const page = (title: string, body: string) => `<!DOCTYPE html><html lang="th"><head><title>${title}</title></head><body>${body}</body></html>`;

function fixture(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "webx-export-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const good = {
  "dgahub.html": page("Hub", '<main id="main-content"><a href="/dgahub/about">About</a> <a href="/dgahub/data/catalog.json">API</a> <a href="https://example.org">ext</a></main>'),
  "dgahub/about.html": page("About", '<main><a href="/dgahub">Home</a> <a href="/dgahub/search?q=x">Search</a></main>'),
  "dgahub/search.html": page("Search", "<main></main>"),
  "dgahub/data/catalog.json": '{"datasets":[]}',
  "en/_/_.html": '<html id="__next_error__"><title>x</title></html>',
  "_next/static/chunks/a.js": 'fetch("https://cms.example.org/api")',
};
const env = { PUBLIC_SITE_URL: "https://hub.example.org", STRAPI_URL: "http://localhost:1337" };

test("a healthy export passes (the \"_\" placeholder route is not a page)", () => {
  const dir = fixture(good);
  try { assert.deepEqual(checkExport(dir, env), []); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("broken pages, links, JSON and leaked CMS addresses are reported", () => {
  const dir = fixture({
    ...good,
    "dgahub/policy.html": '<html id="__next_error__"><head><title>Error</title></head><body></body></html>',
    "dgahub/empty.html": page("Empty", "<div>no main</div>"),
    "dgahub/links.html": page("Links", '<main><a href="/dgahub/missing">x</a></main>'),
    "dgahub/data/bad.json": "{nope",
    "_next/static/chunks/b.js": 'fetch("http://localhost:1337/api/consent-logs")',
  });
  try {
    const p = checkExport(dir, env).join("\n");
    assert.match(p, /\/dgahub\/policy\.html: rendered as a Next\.js error page/);
    assert.match(p, /\/dgahub\/empty\.html: no <main> landmark/);
    assert.match(p, /\/dgahub\/links\.html: broken link \/dgahub\/missing/);
    assert.match(p, /\/dgahub\/data\/bad\.json: invalid JSON/);
    assert.match(p, /b\.js: contains the build machine's CMS address localhost:1337/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the script exits non-zero on a broken page, so `npm run build` fails", () => {
  const dir = fixture({ ...good, "dgahub/policy.html": '<html id="__next_error__"><title>Error</title></html>' });
  try {
    const r = spawnSync(process.execPath, ["scripts/check-export.mjs", dir], { encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /policy\.html: rendered as a Next\.js error page/);
    const ok = fixture(good);
    try {
      const r2 = spawnSync(process.execPath, ["scripts/check-export.mjs", ok], { encoding: "utf8", env: { ...process.env, ...env } });
      assert.equal(r2.status, 0, r2.stdout + r2.stderr);
    } finally { rmSync(ok, { recursive: true, force: true }); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
