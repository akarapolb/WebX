#!/usr/bin/env node
// End-to-end test of the engine's write API (track R3), against the real
// binary: import a snapshot into a throwaway database, mint tokens, then
// create / edit / publish / unpublish / delete through /write and check what
// the read API (/api) serves, tenant isolation, and that it all survives a
// restart. Needs snapshot/snapshot.json (tools/export-snapshot.mjs, or any
// snapshot with a "faqs" type) and a release build.
//
//   node tools/write-test.mjs [--port 1391]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--port");
const PORT = i > 0 ? process.argv[i + 1] : "1391";
const BASE = `http://localhost:${PORT}`;
const exe = join(root, "target", "release", process.platform === "win32" ? "webx-read-engine.exe" : "webx-read-engine");
if (!existsSync(exe)) throw new Error(`no engine binary at ${exe}: cargo build --release first`);

const dir = mkdtempSync(join(tmpdir(), "webx-write-"));
const db = join(dir, "engine.db");
const uploads = join(dir, "uploads");
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`);
  if (!ok) failures++;
};
const sh = (args) => {
  const r = spawnSync(exe, args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};

// the real snapshot, with the faqs type's `question` marked unique (what the exporter writes for "unique": true)
const snap = JSON.parse(readFileSync(join(root, "snapshot", "snapshot.json"), "utf8"));
snap.schema.types.faqs.unique = ["question"];
writeFileSync(join(dir, "snapshot.json"), JSON.stringify(snap));
sh(["import", "--snapshot", join(dir, "snapshot.json"), "--db", db]);
const dga = sh(["token", "--db", db, "--tenant", "dga", "--label", "test"]);
const pea = sh(["token", "--db", db, "--tenant", "pea"]);

let engine;
async function up() {
  engine = spawn(exe, ["--port", PORT, "--db", db, "--uploads", uploads], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  engine.done = new Promise((ok) => engine.on("exit", ok));
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(`${BASE}/_health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("engine did not start");
}
async function down() { engine.kill("SIGTERM"); await engine.done; }

const call = async (method, path, token, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
};
const published = async (tenant, locale = "th") => (await call("GET", `/api/faqs?tenant=${tenant}&locale=${locale}&pagination[pageSize]=100`)).json.data;

try {
  await up();
  const health = await call("GET", "/_health");
  check("health says writable", health.json.readOnly === false);

  check("no token: 401", (await call("GET", "/write/faqs")).status === 401);
  check("wrong token: 401", (await call("GET", "/write/faqs", "nope")).status === 401);

  const before = (await published("dga")).length;
  const c = await call("POST", "/write/faqs?locale=th", dga, { data: { question: "write-test q", answer: "a", order: 99 } });
  check("create: 200 with a draft", c.status === 200 && c.json.data.status === "draft" && c.json.data.documentId, JSON.stringify(c));
  const id = c.json.data.documentId;
  check("draft is not served by the read API", (await published("dga")).length === before);

  const p = await call("POST", `/write/faqs/${id}/publish?locale=th`, dga);
  check("publish: 200", p.status === 200 && p.json.data.status === "published", JSON.stringify(p));
  const rows = await published("dga");
  const mine = rows.find((r) => r.documentId === id);
  check("published entry is served, others untouched", rows.length === before + 1 && mine?.question === "write-test q" && typeof mine.publishedAt === "string");

  const u = await call("PUT", `/write/faqs/${id}?locale=th`, dga, { data: { question: "edited" } });
  check("edit: status modified", u.status === 200 && u.json.data.status === "modified");
  check("edit is a draft until published", (await published("dga")).find((r) => r.documentId === id).question === "write-test q");
  await call("POST", `/write/faqs/${id}/publish?locale=th`, dga);
  check("published after edit", (await published("dga")).find((r) => r.documentId === id).question === "edited");

  const en = await call("PUT", `/write/faqs/${id}?locale=en`, dga, { data: { question: "english" } });
  check("update creates a missing locale", en.status === 200 && en.json.data.locale === "en");
  const miss = await call("GET", `/write/faqs/${id}?locale=xx`, dga);
  check("unknown locale: 400", miss.status === 400);

  check("other tenant cannot read it", (await call("GET", `/write/faqs/${id}?locale=th`, pea)).status === 404);
  check("other tenant cannot edit it", (await call("PUT", `/write/faqs/${id}?locale=th`, pea, { data: { question: "x" } })).status === 404);
  check("other tenant cannot publish it", (await call("POST", `/write/faqs/${id}/publish?locale=th`, pea)).status === 404);
  check("other tenant cannot delete it", (await call("DELETE", `/write/faqs/${id}?locale=th`, pea)).status === 404);
  check("other tenant list does not show it", !(await call("GET", "/write/faqs?locale=th", pea)).json.data.some((r) => r.documentId === id));
  check("tenant cannot be chosen by query", (await call("GET", `/write/faqs/${id}?locale=th&tenant=dga`, pea)).status === 404);
  check("the other tenant's published content is unchanged", !(await published("pea")).some((r) => r.documentId === id));

  check("unknown type: 404", (await call("GET", "/write/nothing", dga)).status === 404);
  check("unknown document: 404", (await call("GET", "/write/faqs/doesnotexist?locale=th", dga)).status === 404);
  check("body must carry data: 400", (await call("POST", "/write/faqs", dga, { question: "x" })).status === 400);
  check("engine fields cannot be set: 400", (await call("POST", "/write/faqs", dga, { data: { documentId: "x" } })).status === 400);

  // unique fields: a duplicate in the same tenant + locale is refused with Strapi's 400 shape
  const u1 = await call("POST", "/write/faqs?locale=th", dga, { data: { question: "unique-q" } });
  const dup = await call("POST", "/write/faqs?locale=th", dga, { data: { question: "unique-q" } });
  check("unique: duplicate create is 400 ValidationError", dup.status === 400 && dup.json.error.name === "ValidationError" && dup.json.error.message === "This attribute must be unique" && dup.json.error.details.errors[0].path[0] === "question", JSON.stringify(dup));
  const u2 = await call("POST", "/write/faqs?locale=th", dga, { data: { question: "unique-q2" } });
  const upd = await call("PUT", `/write/faqs/${u2.json.data.documentId}?locale=th`, dga, { data: { question: "unique-q" } });
  check("unique: update to a taken value is 400", upd.status === 400 && upd.json.error.details.errors[0].path[0] === "question", JSON.stringify(upd));
  check("unique: saving an entry with its own value is fine", (await call("PUT", `/write/faqs/${u1.json.data.documentId}?locale=th`, dga, { data: { question: "unique-q" } })).status === 200);
  check("unique: same value in another locale is fine", (await call("PUT", `/write/faqs/${u1.json.data.documentId}?locale=en`, dga, { data: { question: "unique-q" } })).status === 200);
  check("unique: same value in another tenant is fine", (await call("POST", "/write/faqs?locale=th", pea, { data: { question: "unique-q" } })).status === 200);
  check("unique: the failed update left the entry alone", (await call("GET", `/write/faqs/${u2.json.data.documentId}?locale=th`, dga)).json.data.question === "unique-q2");
  for (const d of [u1, u2]) await call("DELETE", `/write/faqs/${d.json.data.documentId}`, dga);

  // media (R4)
  // a real 3 x 2 PNG: width and height come from its header
  const png = Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.from([0, 0, 0, 3, 0, 0, 0, 2, 8, 2, 0, 0, 0])]);
  const upRes = await fetch(`${BASE}/write/_media?name=${encodeURIComponent("my logo.png")}`, { method: "POST", headers: { authorization: `Bearer ${dga}`, "content-type": "image/png" }, body: png });
  const upj = await upRes.json();
  check("media upload: 200 with url and mime", upRes.status === 200 && upj.data.mime === "image/png" && upj.data.url.startsWith("/uploads/dga/") && upj.data.name === "my logo.png", JSON.stringify(upj));
  check("media upload: width and height from the header", upj.data.width === 3 && upj.data.height === 2, JSON.stringify(upj));
  const file = await fetch(`${BASE}${upj.data.url}`);
  check("the file is served from /uploads, byte for byte", file.status === 200 && Buffer.from(await file.arrayBuffer()).equals(png));
  const mid = upj.data.documentId;
  check("media upload without a token: 401", (await fetch(`${BASE}/write/_media?name=x`, { method: "POST", body: png })).status === 401);
  check("empty upload: 400", (await fetch(`${BASE}/write/_media?name=x`, { method: "POST", headers: { authorization: `Bearer ${dga}` } })).status === 400);
  const mu = await call("PUT", `/write/_media/${mid}`, dga, { caption: "Our logo", tags: "brand" });
  check("media edit", mu.status === 200 && mu.json.data.caption === "Our logo" && mu.json.data.alt === null);
  check("media search finds it", (await call("GET", "/write/_media?search=brand", dga)).json.meta.pagination.total === 1);
  check("media search misses", (await call("GET", "/write/_media?search=zzz", dga)).json.meta.pagination.total === 0);
  check("other tenant: list is empty", (await call("GET", "/write/_media", pea)).json.data.length === 0);
  check("other tenant cannot read, edit or delete it", (await call("GET", `/write/_media/${mid}`, pea)).status === 404 && (await call("PUT", `/write/_media/${mid}`, pea, { caption: "x" })).status === 404 && (await call("DELETE", `/write/_media/${mid}`, pea)).status === 404);
  const evil = await fetch(`${BASE}/write/_media?name=${encodeURIComponent("../../evil.txt")}`, { method: "POST", headers: { authorization: `Bearer ${pea}` }, body: "x" });
  const evilj = await evil.json();
  check("a path in the file name stays inside the tenant folder", evil.status === 200 && evilj.data.url.startsWith("/uploads/pea/") && !evilj.data.url.slice(13).includes("/"), evilj.data?.url);

  // restart: drafts, published rows and tokens persist
  await down();
  await up();
  check("token still valid after restart", (await call("GET", `/write/faqs/${id}?locale=th`, dga)).status === 200);
  check("published entry survived restart", (await published("dga")).find((r) => r.documentId === id)?.question === "edited");
  check("english draft survived restart", (await call("GET", `/write/faqs/${id}?locale=en`, dga)).json.data?.question === "english");

  check("media survived restart", (await call("GET", `/write/_media/${mid}`, dga)).json.data?.caption === "Our logo");
  const md = await call("DELETE", `/write/_media/${mid}`, dga);
  check("media delete: 200, file gone", md.status === 200 && (await fetch(`${BASE}${upj.data.url}`)).status === 404);
  check("deleted media: 404", (await call("GET", `/write/_media/${mid}`, dga)).status === 404);

  const un = await call("POST", `/write/faqs/${id}/unpublish?locale=th`, dga);
  check("unpublish: draft kept", un.status === 200 && un.json.data.status === "draft");
  check("unpublished entry is gone from the read API", !(await published("dga")).some((r) => r.documentId === id));

  const del = await call("DELETE", `/write/faqs/${id}?locale=th`, dga);
  check("delete: 200", del.status === 200);
  const gone = await call("GET", `/write/faqs/${id}?locale=th`, dga);
  check("deleted locale resolves empty while another locale exists", gone.status === 200 && gone.json.data === null);
  await call("DELETE", `/write/faqs/${id}`, dga); // no locale: every locale
  check("deleted everywhere: 404", (await call("GET", `/write/faqs/${id}?locale=th`, dga)).status === 404);
  check("published count is back to the start", (await published("dga")).length === before);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  try { await down(); } catch {}
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : "\nwrite API: all checks passed");
process.exit(failures ? 1 : 0);
