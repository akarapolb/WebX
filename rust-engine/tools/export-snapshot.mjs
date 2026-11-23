#!/usr/bin/env node
// Snapshot exporter (rust-engine plan, milestone 2). Reads every publicly
// readable collection from a running Strapi through its own REST API, once per
// tenant and locale, and writes one JSON file the Rust engine serves from.
//
//   node tools/export-snapshot.mjs [--strapi http://localhost:1337] [--out snapshot/snapshot.json]
//
// Going through REST (not the database) means Strapi's own tenant scoping,
// draft/publish filter and public permissions decide what is in the snapshot:
// the engine never sees anything an anonymous visitor could not read.
//
// Each entry is exported with "one level inside" populated: media and
// relations, and components / dynamic zones with `populate=*` inside them.
// That is the deepest shape public-site asks for; the engine trims it down to
// whatever a request's `populate` names. The schema map (which attributes are
// media, relations, components or dynamic zones) comes from content-model/ (the
// source of the content types, decision D5), so the engine knows what to trim.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : def;
};
const STRAPI = arg("strapi", process.env.STRAPI_URL || "http://localhost:1337").replace(/\/$/, "");
const OUT = resolve(arg("out", join(here, "..", "snapshot", "snapshot.json")));
// the content model (../content-model, decision D5): api/<api>/<type>/schema.json, components/<category>/<name>.json
const MODEL = resolve(arg("model", join(here, "..", "..", "content-model")));
const LOCALES = ["th", "en"];
const PAGE = 100; // Strapi's maxLimit (config/api.ts)

// ---- schema map ---------------------------------------------------------
const POPULATABLE = new Set(["media", "relation", "component", "dynamiczone"]);
function attrMap(attributes) {
  const out = {};
  for (const [name, a] of Object.entries(attributes || {})) {
    if (!POPULATABLE.has(a.type)) continue;
    out[name] = a.type === "component" ? { type: "component", component: a.component, repeatable: !!a.repeatable }
      : a.type === "relation" ? { type: "relation", target: a.target }
      : { type: a.type };
  }
  return out;
}

const types = {};
for (const api of readdirSync(join(MODEL, "api"))) {
  const ctDir = join(MODEL, "api", api);
  if (!existsSync(ctDir)) continue;
  for (const ct of readdirSync(ctDir)) {
    const f = join(ctDir, ct, "schema.json");
    if (!existsSync(f)) continue;
    const s = JSON.parse(readFileSync(f, "utf8"));
    if (s.kind !== "collectionType") continue; // single types: none read by public-site
    types[s.info.pluralName] = {
      uid: `api::${api}.${ct}`,
      i18n: !!s.pluginOptions?.i18n?.localized,
      attrs: attrMap(s.attributes),
      // every attribute (name, type, required), for the write API's type listing
      fields: Object.fromEntries(Object.entries(s.attributes || {}).map(([n, a]) => [n, { type: a.type, ...(a.required ? { required: true } : {}) }])),
      // fields the write API requires before it publishes (docs/engine-contract.md, section 8)
      required: Object.entries(s.attributes || {}).filter(([, a]) => a.required).map(([n]) => n),
    };
  }
}
const components = {};
for (const cat of readdirSync(join(MODEL, "components"))) {
  for (const f of readdirSync(join(MODEL, "components", cat))) {
    if (!f.endsWith(".json")) continue;
    const s = JSON.parse(readFileSync(join(MODEL, "components", cat, f), "utf8"));
    components[`${cat}.${f.replace(/\.json$/, "")}`] = { attrs: attrMap(s.attributes) };
  }
}

/** The export's populate query: every populatable attribute, components and
 *  dynamic zones with `populate=*` one level inside. */
function exportPopulate(t) {
  const parts = [];
  for (const [name, a] of Object.entries(t.attrs)) {
    if (a.type === "component" || a.type === "dynamiczone") parts.push(`populate[${name}][populate]=*`);
    else parts.push(`populate[${name}]=true`);
  }
  return parts.join("&");
}

// ---- fetch --------------------------------------------------------------
async function getJson(path) {
  const r = await fetch(STRAPI + path, { headers: { Accept: "application/json" } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

async function exportCollection(plural, tenant, locale) {
  const pop = exportPopulate(types[plural]);
  const rows = [];
  for (let page = 1; ; page++) {
    const q = `?tenant=${encodeURIComponent(tenant)}&locale=${locale}&sort=id:asc&pagination[pageSize]=${PAGE}&pagination[page]=${page}` + (pop ? "&" + pop : "");
    const r = await getJson(`/api/${plural}${q}`);
    if (r.status !== 200) return { status: r.status, rows: null };
    rows.push(...(r.body.data || []));
    const pc = r.body.meta?.pagination?.pageCount || 1;
    if (page >= pc) break;
  }
  return { status: 200, rows };
}

const keys = await getJson("/api/tenants/keys");
if (keys.status !== 200) { console.error(`[export] ${STRAPI}/api/tenants/keys -> HTTP ${keys.status}`); process.exit(1); }
const tenantKeys = (keys.body.data || []).map((t) => t.key).filter(Boolean);
const DEFAULT_TENANT = tenantKeys.includes("dga") ? "dga" : tenantKeys[0];

const special = { "tenants/keys": keys.body, "tenants/resolve": {} };
for (const t of tenantKeys) {
  const r = await getJson(`/api/tenants/resolve?tenant=${encodeURIComponent(t)}&locale=th`);
  if (r.status === 200) special["tenants/resolve"][t] = r.body;
}

const data = {};
const skipped = [];
let count = 0;
for (const plural of Object.keys(types).sort()) {
  for (const tenant of tenantKeys) {
    for (const locale of LOCALES) {
      const r = await exportCollection(plural, tenant, locale);
      if (r.rows === null) { if (!data[plural]) skipped.push(`${plural} (HTTP ${r.status})`); break; }
      ((data[plural] ||= {})[tenant] ||= {})[locale] = r.rows;
      count += r.rows.length;
    }
    if (!data[plural]) break; // not public: no need to try every tenant
  }
}
// Only public types stay in the schema map.
for (const p of Object.keys(types)) if (!data[p]) delete types[p];

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  format: 1, exportedAt: new Date().toISOString(), source: STRAPI, defaultTenant: DEFAULT_TENANT,
  tenants: tenantKeys, locales: LOCALES, schema: { types, components }, special, data,
}));
console.log(`[export] ${Object.keys(data).length} collection(s), ${tenantKeys.length} tenant(s), ${count} row(s) -> ${OUT}`);
if (skipped.length) console.log(`[export] not public, skipped: ${skipped.join(", ")}`);
