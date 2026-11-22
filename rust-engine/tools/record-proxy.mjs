#!/usr/bin/env node
// Fixture recorder (rust-engine plan, milestone 1). A tiny HTTP proxy that
// sits between a public-site build and Strapi and saves every read the build
// makes, so the Rust engine can be tested against Strapi's real answers.
//
//   node tools/record-proxy.mjs [--port 1338] [--target http://localhost:1337] [--out fixtures/requests.json]
//   STRAPI_URL=http://localhost:1338 npm run build      (in public-site, another shell)
//   Ctrl+C (or SIGTERM) writes the file.
//
// Only GET /api/* is recorded (one entry per distinct path+query); everything
// else (e.g. /uploads/*) is passed through untouched. Nothing in public-site
// changes: the proxy is just another STRAPI_URL.
import http from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const arg = (name, def) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : def;
};
const PORT = Number(arg("port", "1338"));
const TARGET = new URL(arg("target", process.env.STRAPI_URL || "http://localhost:1337"));
const OUT = resolve(arg("out", "fixtures/requests.json"));

/** @type {Map<string, {path: string, status: number, body: any}>} */
const seen = new Map();

const server = http.createServer((req, res) => {
  if (req.url === "/__save") { save(); res.end(String(seen.size)); return; } // scripts: write now
  const opts = { hostname: TARGET.hostname, port: TARGET.port, path: req.url, method: req.method, headers: { ...req.headers, host: TARGET.host } };
  const up = http.request(opts, (ur) => {
    const chunks = [];
    ur.on("data", (c) => chunks.push(c));
    ur.on("end", () => {
      const buf = Buffer.concat(chunks);
      if (req.method === "GET" && req.url.startsWith("/api/") && !seen.has(req.url)) {
        let body;
        try { body = JSON.parse(buf.toString("utf8")); } catch { body = buf.toString("utf8"); }
        seen.set(req.url, { path: req.url, status: ur.statusCode || 0, body });
      }
      res.writeHead(ur.statusCode || 502, ur.headers);
      res.end(buf);
    });
  });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
});

function save() {
  mkdirSync(dirname(OUT), { recursive: true });
  const list = [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(OUT, JSON.stringify(list, null, 1));
  console.log(`[record-proxy] ${list.length} request(s) -> ${OUT}`);
}
let saved = false;
const stop = () => { if (!saved) { saved = true; save(); } process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
// Also save periodically, so a hard kill (Windows) still leaves a file.
setInterval(() => { if (seen.size) save(); }, 15000).unref();

server.listen(PORT, () => console.log(`[record-proxy] :${PORT} -> ${TARGET.origin}, recording GET /api/*`));
