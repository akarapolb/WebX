// One-off migration: wires the real "event-calendar" block into WordPress's
// own stored page layout for ORST's "news" page and RoyalSociety's
// "activities" page — the Visual Builder's write path (acf.blocks) takes
// priority over templates/{tenant}/content/*.json once a page has been
// migrated (see app/{orst,royalsociety}/[page]/page.tsx's own comment), so
// editing those repo JSON files alone has no effect on an already-migrated
// environment; this patches the same live data seed-orst-sources.mjs and
// seed-orst-layout.mjs write to.
//
// ORST: "calendar" block already existed (an always-empty `table`
// placeholder, id "calendar") — converted in place to `event-calendar` with
// a real source binding. RoyalSociety: no such block existed yet — inserted
// between "activities-list" and "activities-reports", matching
// activities.json's own updated shape.
//
// Safe to re-run: always sets these exact block objects, overwriting
// whatever's there — same idempotency note as seed-orst-sources.mjs.
//
// Usage: node wordpress/seed-event-calendar-blocks.mjs

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

const EVENT_CALENDAR_SOURCE = { kind: "wp", postType: "event", map: "calendar" };

async function main() {
  // ORST news: convert the existing empty "table" placeholder in place.
  {
    const { page, blocks } = await loadBlocks("orst-news");
    const idx = blocks.findIndex((b) => b.id === "calendar");
    if (idx === -1) throw new Error('orst-news: block id "calendar" not found');
    blocks[idx] = {
      type: "event-calendar", id: "calendar", variant: "alt",
      heading: "ปฏิทินกิจกรรม", lead: "กำหนดการจะปรับปรุงตามข้อมูลล่าสุดจากสำนักงาน",
      source: EVENT_CALENDAR_SOURCE, items: [],
    };
    await saveBlocks(page, blocks);
    console.log("orst-news: converted \"calendar\" block to event-calendar");
  }

  // RoyalSociety activities: insert a new block between activities-list and
  // activities-reports (matching content/activities.json's own position).
  {
    const { page, blocks } = await loadBlocks("royalsociety-activities");
    const already = blocks.findIndex((b) => b.id === "activities-calendar");
    const newBlock = {
      id: "activities-calendar", type: "event-calendar", eyebrow: "ปฏิทิน",
      heading: "ปฏิทินกิจกรรม", lead: "กิจกรรมที่เปิดให้ประชาชนเข้าร่วม — เลือกวันที่เพื่อดูรายละเอียดและเพิ่มลงปฏิทินของคุณ",
      source: EVENT_CALENDAR_SOURCE, items: [],
    };
    if (already !== -1) {
      blocks[already] = newBlock;
    } else {
      const afterIdx = blocks.findIndex((b) => b.id === "activities-list");
      blocks.splice(afterIdx === -1 ? blocks.length : afterIdx + 1, 0, newBlock);
    }
    await saveBlocks(page, blocks);
    console.log("royalsociety-activities: " + (already !== -1 ? "updated" : "inserted") + " \"activities-calendar\" block");
  }

  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
