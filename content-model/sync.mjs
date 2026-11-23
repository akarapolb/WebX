#!/usr/bin/env node
// content-model/ is the source of truth for WebX's content types (docs/target-architecture.md,
// decision D5, track R1). The format is Strapi's own schema.json, so Strapi's
// copies are generated from here by copying, and every engine (the Rust engine's
// exporter, Studio) reads this folder.
//
//   node content-model/sync.mjs check    fail if strapi-cms differs from content-model (CI)
//   node content-model/sync.mjs write    copy content-model into strapi-cms
//   node content-model/sync.mjs adopt    copy strapi-cms into content-model (used once, to start)
//
// Layout (left is here, right is the Strapi copy):
//   api/<api>/<type>/schema.json     strapi-cms/src/api/<api>/content-types/<type>/schema.json
//   components/<category>/<name>.json  strapi-cms/src/components/<category>/<name>.json
// Line endings do not count as a difference (Windows checkouts have CRLF).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const strapi = resolve(here, "..", "strapi-cms", "src");

/** every model file as { rel (in content-model), copy (path of its Strapi copy) } for one side's tree */
function files(side) {
  const out = [];
  const list = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []);
  if (side === "model") {
    for (const a of list(join(here, "api"))) for (const t of list(join(here, "api", a.name)))
      if (t.isDirectory()) out.push(`api/${a.name}/${t.name}/schema.json`);
    for (const c of list(join(here, "components"))) for (const f of list(join(here, "components", c.name)))
      if (f.name.endsWith(".json")) out.push(`components/${c.name}/${f.name}`);
  } else {
    for (const a of list(join(strapi, "api"))) for (const t of list(join(strapi, "api", a.name, "content-types")))
      if (t.isDirectory() && existsSync(join(strapi, "api", a.name, "content-types", t.name, "schema.json"))) out.push(`api/${a.name}/${t.name}/schema.json`);
    for (const c of list(join(strapi, "components"))) for (const f of list(join(strapi, "components", c.name)))
      if (f.name.endsWith(".json")) out.push(`components/${c.name}/${f.name}`);
  }
  return out.sort();
}
const modelPath = (rel) => join(here, rel);
const strapiPath = (rel) => join(strapi, rel.replace(/^api\/([^/]+)\/([^/]+)\//, "api/$1/content-types/$2/"));
const norm = (s) => s.replace(/\r\n/g, "\n");
const read = (p) => (existsSync(p) ? norm(readFileSync(p, "utf8")) : null);
const put = (p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

const mode = process.argv[2];
const model = files("model"), copies = files("strapi");

if (mode === "check") {
  const problems = [];
  for (const rel of model) {
    const a = read(modelPath(rel)), b = read(strapiPath(rel));
    if (b === null) problems.push(`${rel}: missing in strapi-cms (run: node content-model/sync.mjs write)`);
    else if (a !== b) problems.push(`${rel}: strapi-cms differs from content-model (edit content-model, then run: node content-model/sync.mjs write)`);
  }
  for (const rel of copies) if (!model.includes(rel)) problems.push(`${rel}: only in strapi-cms (add it to content-model: node content-model/sync.mjs adopt)`);
  for (const rel of model) { try { JSON.parse(read(modelPath(rel))); } catch (e) { problems.push(`${rel}: not valid JSON (${e.message})`); } }
  if (problems.length) { console.error(problems.join("\n")); console.error(`\ncontent-model: ${problems.length} problem(s)`); process.exit(1); }
  console.log(`content-model: ${model.length} file(s), strapi-cms matches`);
} else if (mode === "write") {
  let n = 0;
  for (const rel of model) { const a = read(modelPath(rel)); if (a !== read(strapiPath(rel))) { put(strapiPath(rel), a); n++; } }
  console.log(`content-model: wrote ${n} file(s) into strapi-cms (${model.length} in the model)`);
} else if (mode === "adopt") {
  let n = 0;
  for (const rel of copies) { const b = read(strapiPath(rel)); if (b !== read(modelPath(rel))) { put(modelPath(rel), b); n++; } }
  console.log(`content-model: took ${n} file(s) from strapi-cms (${copies.length} there)`);
} else {
  console.error("usage: node content-model/sync.mjs check|write|adopt");
  process.exit(2);
}
