#!/usr/bin/env node
// Contract test (rust-engine plan, "the test that decides done", step 2).
// Replays every request a public-site build made against Strapi
// (fixtures/requests.json, from tools/record-proxy.mjs) against the engine and
// compares the answers.
//
//   node tools/contract-test.mjs [--engine http://localhost:1338] [--fixtures fixtures/requests.json]
//
// Pass = same HTTP status and the same `data` for every request, compared
// strictly (ids and timestamps included: the snapshot keeps them). Key order is
// reported separately: it does not change the JSON's meaning, but a build only
// comes out byte-identical when it matches too. Exit 1 on any difference.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const arg = (name, def) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : def;
};
const ENGINE = arg("engine", "http://localhost:1338").replace(/\/$/, "");
const fixtures = JSON.parse(readFileSync(resolve(arg("fixtures", "fixtures/requests.json")), "utf8"));

const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

/** First path where a and b differ, for the report. */
function firstDiff(a, b, path = "") {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(a) && a.length !== b.length) return `${path || "."}: length ${a.length} (Strapi) vs ${b.length} (engine)`;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in b)) return `${path}.${k}: only in Strapi`;
      if (!(k in a)) return `${path}.${k}: only in engine`;
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  const s = (x) => JSON.stringify(x)?.slice(0, 80);
  return `${path || "."}: ${s(a)} (Strapi) vs ${s(b)} (engine)`;
}

let same = 0, orderOnly = 0;
const failures = [];
for (const f of fixtures) {
  const r = await fetch(ENGINE + f.path, { headers: { Accept: "application/json" } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (r.status !== f.status) { failures.push(`${f.path}\n    status ${f.status} (Strapi) vs ${r.status} (engine)${r.status === 400 ? ": " + body?.error?.message : ""}`); continue; }
  const want = f.status === 200 ? f.body?.data : f.body;
  const got = f.status === 200 ? body?.data : body;
  if (f.status !== 200) { same++; continue; } // both errored the same way
  if (!isDeepStrictEqual(sortKeys(want), sortKeys(got))) { failures.push(`${f.path}\n    ${firstDiff(sortKeys(want), sortKeys(got))}`); continue; }
  if (JSON.stringify(want) === JSON.stringify(got)) same++; else orderOnly++;
}

console.log(`[contract] ${fixtures.length} request(s): ${same} identical, ${orderOnly} same data in a different key order, ${failures.length} different`);
for (const f of failures.slice(0, 25)) console.log("  - " + f);
if (failures.length > 25) console.log(`  … and ${failures.length - 25} more`);
process.exit(failures.length ? 1 : 0);
