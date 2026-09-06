/* ============================================================
   index-wp-documents.mjs — PDF/DOCX/XLSX full-text search for WordPress
   documents (TOR gap audit — see wordpress/mu-plugins/document-search.php's
   own comment: WordPress's native search never matched a document's actual
   FILE contents, only its title/excerpt — unlike Strapi's ebook/download
   content types, which already index this via src/utils/extract-text.ts).

   Fetches every `document` post (across all tenants) from WordPress's own
   REST API, downloads each one's real File URL (acf.file_url — deliberately
   left blank until a real file exists, per that field's own instructions;
   this script silently skips any document with no file_url set, never
   fabricates one), extracts its text with the SAME pdf-parse/mammoth/xlsx
   libraries strapi-cms already depends on for ebook/download, and PUTs the
   result into that WordPress post's `content_text` ACF field — which
   document-search.php's posts_search filter then makes searchable via
   /wp/v2/search, the same endpoint every tenant's site-search box calls.

   Extraction runs in a separate child process (_extract-text-worker.cjs) —
   found live, reproducibly, that `pdf-parse` returns garbled/wrong results
   ("bad XRef entry" on a perfectly valid PDF) when loaded via createRequire()
   from this ESM (.mjs) file directly; a genuine CommonJS file doesn't have
   the problem. Ruled out red herrings first: not the file content (byte-
   identical either way), not fetch() interference, not Buffer pooling —
   isolated down to exactly the ESM-vs-CJS module-loading difference.

   Safe to re-run: always re-extracts and overwrites content_text for every
   document that has a file_url set (a document whose file changed gets
   correctly re-indexed); a document with no file_url is left untouched
   (never blanks out a previously-set value).

   Usage: node scripts/index-wp-documents.mjs
   Reads WORDPRESS_URL / WORDPRESS_SCHEDULER_USERNAME /
   WORDPRESS_SCHEDULER_APP_PASSWORD from webx-studio/.env.local (same
   credentials wordpress/seed-*.mjs scripts already use), or from the
   environment if set.
   ============================================================ */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This script lives in strapi-cms/scripts/ (two levels below the actual
// repo root, unlike wordpress/seed-*.mjs which lives one level below it) —
// webx-studio is a SIBLING of strapi-cms, not a child.
const repoRoot = path.resolve(__dirname, '..', '..');
const WORKER_PATH = path.join(__dirname, '_extract-text-worker.cjs');

function loadEnvLocal() {
  const envPath = path.join(repoRoot, 'webx-studio', '.env.local');
  const out = {};
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {}
  return out;
}

const envFile = loadEnvLocal();
const WORDPRESS_URL = (process.env.WORDPRESS_URL || envFile.WORDPRESS_URL || 'http://localhost:8081/wp-json').replace(/\/$/, '');
const WP_USER = process.env.WORDPRESS_SCHEDULER_USERNAME || envFile.WORDPRESS_SCHEDULER_USERNAME;
const WP_PASS = process.env.WORDPRESS_SCHEDULER_APP_PASSWORD || envFile.WORDPRESS_SCHEDULER_APP_PASSWORD;
if (!WP_USER || !WP_PASS) {
  console.error('Missing WORDPRESS_SCHEDULER_USERNAME / WORDPRESS_SCHEDULER_APP_PASSWORD (checked env and webx-studio/.env.local)');
  process.exit(1);
}
const AUTH = 'Basic ' + Buffer.from(WP_USER + ':' + WP_PASS).toString('base64');

async function req(reqPath, opts = {}) {
  const r = await fetch(WORDPRESS_URL + reqPath, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: AUTH, ...(opts.headers || {}) },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(reqPath + ' -> ' + r.status + ': ' + (body.message || text).slice(0, 300));
  return body;
}

function extractText(absPath, hint) {
  try {
    return execFileSync('node', [WORKER_PATH, absPath, hint], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    console.warn('  extraction failed:', (e.stderr || e.message).toString().trim());
    return '';
  }
}

async function main() {
  const docs = await req('/wp/v2/document?per_page=100&status=publish,draft,pending,future');
  console.log('found', docs.length, 'document post(s)');
  let indexed = 0, skipped = 0;
  for (const doc of docs) {
    const fileUrl = doc.acf?.file_url;
    if (!fileUrl) { skipped++; continue; }
    console.log('indexing', doc.slug, '<-', fileUrl);
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) { console.warn('  could not download file:', fileRes.status); continue; }
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const tmpPath = path.join(tmpdir(), 'webx-doc-index-' + doc.id + path.extname(new URL(fileUrl).pathname));
    writeFileSync(tmpPath, buf);
    let text;
    try {
      text = extractText(tmpPath, fileUrl);
    } finally {
      try { unlinkSync(tmpPath); } catch {}
    }
    if (!text.trim()) { console.warn('  no text extracted (unsupported type or empty file)'); continue; }
    await req('/wp/v2/document/' + doc.id, {
      method: 'POST',
      body: JSON.stringify({ acf: { content_text: text.slice(0, 200000) } }),
    });
    console.log('  indexed', text.length, 'characters');
    indexed++;
  }
  console.log(`done. indexed ${indexed}, skipped ${skipped} (no file_url).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
