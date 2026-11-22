#!/usr/bin/env node
// Build test (rust-engine plan, "the test that decides done", step 3).
// Compares two public-site exports file by file: one built against Strapi,
// one against the engine.
//
//   node tools/build-diff.mjs <strapi-export-dir> <engine-export-dir> [--only dgahub]
//
// The only allowed difference is Next's build id (a random folder name under
// _next/static/ that also appears inside pages); it is replaced by BUILD_ID on
// both sides before comparing. Everything else (HTML, RSC .txt payloads,
// search-index.json, sitemap.xml, /data/*.json and .csv, JS chunks) must be
// byte-identical. --only limits the check to one tenant's pages (TH + EN) plus
// shared assets. Exit 1 on any difference.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith("--"));
const oi = process.argv.indexOf("--only");
const only = oi > 0 ? process.argv[oi + 1] : null;
if (!a || !b) { console.error("usage: build-diff.mjs <strapi-export> <engine-export> [--only tenant]"); process.exit(2); }

const KNOWN = new Set(["chunks", "media", "css"]);
// The id appears twice: as written in pages (<!--id--> right after the
// doctype) and as the folder under _next/static, where Next turns "_" into "-".
// Both forms are replaced.
function buildIds(dir) {
  const folder = readdirSync(join(dir, "_next", "static")).find((n) => !KNOWN.has(n));
  const page = /^<!DOCTYPE html><!--([^>]+?)-->/.exec(readFileSync(join(dir, "404.html"), "latin1"))?.[1];
  return [...new Set([page, folder].filter(Boolean))];
}
const unId = (t, ids) => ids.reduce((s, id) => s.split(id).join("BUILD_ID"), t);

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function inScope(rel) {
  if (!only) return true;
  const r = rel.split(sep).join("/");
  return r.startsWith(`${only}/`) || r.startsWith(`${only}.`) || r.startsWith(`en/${only}/`) || r.startsWith(`en/${only}.`)
    || r.startsWith("_next/") || r.startsWith("assets/") || r.startsWith("fonts/");
}

function files(dir) {
  const ids = buildIds(dir);
  const map = new Map();
  for (const f of walk(dir)) {
    const rel = relative(dir, f);
    if (!inScope(rel)) continue;
    map.set(unId(rel, ids), { f, ids });
  }
  return map;
}

// Next writes a page's React Server Components payload (the .txt file, and
// again inside the .html as self.__next_f.push scripts) as numbered rows, and
// the order and numbering of the module-reference rows changes from build to
// build even with identical input (two builds against the same engine
// snapshot differ). So for pages: the HTML without those scripts must be
// byte-identical, and the payload rows must be the same multiset once row
// numbers are taken out. Real content changes still show up in both.
// Rows are `<id>:<json>\n`, except text rows `<id>:T<hex byte length>,<text>`
// with no line break after them. `t` is latin1-decoded, so one char = one byte.
function flightRows(t) {
  const rows = [];
  let p = 0;
  while (p < t.length) {
    if (t[p] === "\n") { p++; continue; }
    const colon = t.indexOf(":", p);
    if (colon < 0) { rows.push(t.slice(p)); break; }
    let body;
    const m = /^T([0-9a-f]+),/.exec(t.slice(colon + 1, colon + 20));
    if (m) {
      const start = colon + 1 + m[0].length;
      body = "T," + t.slice(start, start + parseInt(m[1], 16));
      p = start + parseInt(m[1], 16);
    } else {
      const nl = t.indexOf("\n", colon);
      body = t.slice(colon + 1, nl < 0 ? t.length : nl);
      p = nl < 0 ? t.length : nl + 1;
    }
    rows.push(body.replace(/"\$(@|L|F|Q|W|K|B|n|S)?[0-9a-f]+(?=[":])/g, '"$$$1#'));
  }
  return rows.sort();
}
function rscEqual(k, ta, tb) {
  const strip = (t) => t.replace(/<script>self\.__next_f\.push\([\s\S]*?\)<\/script>/g, "");
  const flight = (t) => [...t.matchAll(/<script>self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g)].map((m) => JSON.parse(m[1])).join("");
  if (k.endsWith(".txt")) return JSON.stringify(flightRows(ta)) === JSON.stringify(flightRows(tb));
  return strip(ta) === strip(tb) && JSON.stringify(flightRows(flight(ta))) === JSON.stringify(flightRows(flight(tb)));
}

let flightOrder = 0;
const A = files(a), B = files(b);
const problems = [];
for (const k of A.keys()) if (!B.has(k)) problems.push(`only in Strapi build: ${k}`);
for (const k of B.keys()) if (!A.has(k)) problems.push(`only in engine build: ${k}`);
let same = 0;
for (const [k, x] of A) {
  const y = B.get(k);
  if (!y) continue;
  const ca = readFileSync(x.f), cb = readFileSync(y.f);
  if (ca.equals(cb)) { same++; continue; }
  const ta = unId(ca.toString("latin1"), x.ids);
  const tb = unId(cb.toString("latin1"), y.ids);
  if (ta === tb) { same++; continue; }
  if (/\.(html|txt)$/.test(k) && rscEqual(k, ta, tb)) { flightOrder++; continue; }
  let i = 0;
  while (i < ta.length && ta[i] === tb[i]) i++;
  const ctx = (t) => Buffer.from(t.slice(Math.max(0, i - 60), i + 80), "latin1").toString("utf8").replace(/\s+/g, " ");
  problems.push(`differs: ${k} at byte ${i}\n      Strapi: …${ctx(ta)}…\n      engine: …${ctx(tb)}…`);
}

console.log(`[build-diff] ${A.size} file(s)${only ? ` (${only} + shared assets)` : ""}: ${same} byte-identical, ${flightOrder} identical apart from Next's RSC row order, ${problems.length} problem(s)`);
for (const p of problems.slice(0, 30)) console.log("  - " + p);
if (problems.length > 30) console.log(`  … and ${problems.length - 30} more`);
process.exit(problems.length ? 1 : 0);
