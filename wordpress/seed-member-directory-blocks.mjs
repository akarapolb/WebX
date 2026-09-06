// One-off migration: wires the real "member-directory" block into
// WordPress's own stored page layout for both tenants' "about" pages, and
// updates RoyalSociety's home page card to link straight to it — same
// reasoning as seed-event-calendar-blocks.mjs (the Visual Builder's write
// path, acf.blocks, takes priority over templates/{tenant}/content/*.json
// once a page is migrated, so editing the repo JSON alone has no effect on
// an already-migrated environment).
//
// ORST about: inserted between "structure" and "transparency" (matching
// content/about.json's updated shape). RoyalSociety about: inserted between
// "structure" and "knowledge-standards". RoyalSociety home: the existing
// "ประวัติราชบัณฑิตและภาคีสมาชิก" recommended-card's href updated from
// "/royalsociety/about" to "/royalsociety/about#members".
//
// Safe to re-run: always sets these exact values, overwriting whatever's
// there — same idempotency note as seed-event-calendar-blocks.mjs.
//
// Usage: node wordpress/seed-member-directory-blocks.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(repoRoot, "webx-studio", ".env.local");
  const out = {};
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {}
  return out;
}

const envFile = loadEnvLocal();
const WORDPRESS_URL = (process.env.WORDPRESS_URL || envFile.WORDPRESS_URL || "http://localhost:8081/wp-json").replace(/\/$/, "");
const WP_USER = process.env.WORDPRESS_SCHEDULER_USERNAME || envFile.WORDPRESS_SCHEDULER_USERNAME;
const WP_PASS = process.env.WORDPRESS_SCHEDULER_APP_PASSWORD || envFile.WORDPRESS_SCHEDULER_APP_PASSWORD;
if (!WP_USER || !WP_PASS) {
  console.error("Missing WORDPRESS_SCHEDULER_USERNAME / WORDPRESS_SCHEDULER_APP_PASSWORD (checked env and webx-studio/.env.local)");
  process.exit(1);
}
const AUTH = "Basic " + Buffer.from(WP_USER + ":" + WP_PASS).toString("base64");

async function req(reqPath, opts = {}) {
  const r = await fetch(WORDPRESS_URL + reqPath, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: AUTH, ...(opts.headers || {}) },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(reqPath + " -> " + r.status + ": " + (body.message || text).slice(0, 300));
  return body;
}

async function loadBlocks(wpSlug) {
  const rows = await req("/wp/v2/pages?slug=" + encodeURIComponent(wpSlug) + "&status=publish,draft,pending,future&per_page=5&context=edit");
  const page = rows[0];
  if (!page) throw new Error("Page not found: " + wpSlug);
  return { page, blocks: JSON.parse(page.acf.blocks || "[]") };
}

async function saveBlocks(page, blocks) {
  await req("/wp/v2/pages/" + page.id, { method: "POST", body: JSON.stringify({ acf: { blocks: JSON.stringify(blocks) } }) });
}

const MEMBER_SOURCE = { kind: "wp", postType: "member", map: "directory" };

function upsertAfter(blocks, newBlock, afterId) {
  const already = blocks.findIndex((b) => b.id === newBlock.id);
  if (already !== -1) { blocks[already] = newBlock; return "updated"; }
  const afterIdx = blocks.findIndex((b) => b.id === afterId);
  blocks.splice(afterIdx === -1 ? blocks.length : afterIdx + 1, 0, newBlock);
  return "inserted";
}

async function main() {
  {
    const { page, blocks } = await loadBlocks("orst-about");
    const action = upsertAfter(blocks, {
      type: "member-directory", id: "members", variant: "alt",
      heading: "ราชบัณฑิตและภาคีสมาชิก", lead: "รายชื่อผู้ทรงคุณวุฒิที่ได้รับการแต่งตั้งเป็นราชบัณฑิตและภาคีสมาชิก",
      source: MEMBER_SOURCE, items: [],
    }, "structure");
    await saveBlocks(page, blocks);
    console.log("orst-about: " + action + " \"members\" block");
  }

  {
    const { page, blocks } = await loadBlocks("royalsociety-about");
    const action = upsertAfter(blocks, {
      id: "members", type: "member-directory", eyebrow: "Fellows & Associate Members",
      heading: "ราชบัณฑิตและภาคีสมาชิก",
      lead: "ผู้ทรงคุณวุฒิที่ได้รับการแต่งตั้งเป็นราชบัณฑิตและภาคีสมาชิก ผู้สร้างสรรค์องค์ความรู้ของประเทศ",
      source: MEMBER_SOURCE, items: [],
    }, "structure");
    await saveBlocks(page, blocks);
    console.log("royalsociety-about: " + action + " \"members\" block");
  }

  {
    const { page, blocks } = await loadBlocks("royalsociety-home");
    const homeBlock = blocks.find((b) => Array.isArray(b.items) && b.items.some((it) => it?.href === "/royalsociety/about" && it?.title === "ประวัติราชบัณฑิตและภาคีสมาชิก"));
    if (!homeBlock) {
      console.log("royalsociety-home: recommended card not found (already updated, or block renamed) — skipping");
    } else {
      const item = homeBlock.items.find((it) => it?.href === "/royalsociety/about" && it?.title === "ประวัติราชบัณฑิตและภาคีสมาชิก");
      item.href = "/royalsociety/about#members";
      await saveBlocks(page, blocks);
      console.log("royalsociety-home: updated recommended card href to /royalsociety/about#members");
    }
  }

  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
