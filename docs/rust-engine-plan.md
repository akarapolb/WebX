# Plan: read-only Rust engine for the public-site build

Status: milestones 1–5 built and passing (2026-11-22, code in
`rust-engine/`, see its README; CI in `.github/workflows/rust-engine.yml`);
6 dropped. The target architecture (`target-architecture.md`, decided
2026-11-22) makes the Rust engine one of three engines with its own store,
behind a WebX control plane, so it no longer reads Strapi's tables. Off the
DGA critical path: the hub ships on Strapi whatever happens here.

## Results so far (2026-11-22)

All steps run as one command, `node tools/build-test.mjs`, the same locally
and in CI.

- **Contract test:** a full public-site build made 192 distinct read
  requests (all tenants, both locales). Replayed against the engine: 192/192
  return the same status and byte-identical JSON (key order included).
- **Build test:** public-site built against the engine (`STRAPI_URL` on the
  same address the Strapi reference used), from a cold cache, and recorded on
  the way: it read the same 192 paths from the engine as the reference build
  read from Strapi. 596 exported files, 0 differences (506 byte-identical, 90
  identical once Next's own React Server Components row order is ignored);
  per Strapi tenant: `dga` 437 files and `pea` 289 (both gov-portal),
  `dgahub` 368, all 0 differences; `check-export` passes on both builds.
  Two builds against the *same* engine snapshot also differ in that row order,
  so it is Next's, not the engine's; `tools/build-diff.mjs` compares those
  rows as a set and still catches a one-word content change.
- **Correction to the first build test (milestone 4):** Next keeps its fetch
  cache in `public-site/.next/cache` whatever `NEXT_DIST_DIR` says, keyed by
  URL, and both builds use the same URL, so that first engine build may have
  been served partly from cached Strapi answers. `build-test.mjs` now clears
  the cache before each build and fails unless the engine build read the same
  paths from the engine; the results above are from that run.
- **Footprint:** release binary 1.8 MB, about 12 MB of memory serving the
  snapshot (Strapi's process: about 186 MB, and minutes to start). Exporting
  the snapshot takes about 5 seconds; a public-site build against the engine
  took 31–35 seconds.
- **Safety:** only published, publicly readable content is exported
  (Strapi's own permissions decide; 22 private types were refused); the
  engine answers `POST` with 405 and unknown query parameters or operators
  (e.g. `status=draft`, `$containsi`) with 400.
- **One Strapi quirk reproduced on purpose:** in a sorted list Strapi puts
  the sort fields first in each entry; the engine does the same.

## Why

The public site needs only the **read API** of the engine contract
(`docs/engine-contract.md`, section 6): a dozen GET requests at build time,
published content only. Today that means running the whole Strapi admin
application (Node, ~3.5 minutes to start, hundreds of dependencies, including
the GPL CKEditor packages flagged in R-15) just so a build can read JSON. A small
read-only server would:

- make builds and CI faster and lighter (one static binary, starts in
  milliseconds);
- let the public build run from a snapshot (an export file) with no live CMS,
  e.g. in an air-gapped agency network;
- shrink the attack surface of anything reachable from the build network.

It does not replace Strapi for editing: Studio keeps writing to Strapi (or
WordPress).

## Scope

In:

- The section 6 endpoints with the same query subset (`filters[…][$eq]`,
  `sort`, `pagination[pageSize]`, `fields[n]`, `populate` for blocks and media),
  same `{ "data": [...] }` envelope, `tenant` and `locale` parameters,
  published rows only.
- Media: serve or redirect `/uploads/*` from the same storage Strapi uses.
- Health: `GET /_health`.

Out (stays on Strapi): every write, the admin API, auth, the public runtime
routes (assistant, forms, consent, search analytics), WordPress tenants.

## Design

```
Strapi (editing) ──publish──► snapshot export ──► rust-engine (read-only) ──► public-site build
                    (Postgres)  (JSON per tenant/locale,     axum + serde,
                                 or read Postgres directly)   in-memory index
```

- **Language and crates:** Rust stable, `axum` (HTTP), `serde_json`, `tokio`;
  `sqlx` only if reading Postgres directly.
- **Data source, two modes:**
  1. *Snapshot (first):* a JSON export of published content per tenant and
     locale, produced by a small Strapi script (or `strapi export`, then
     converted). The server loads it into memory at start.
  2. *Live (later):* read Strapi's Postgres tables directly (published rows,
     `documentId`, locale, components joined for the dynamic zone). Tied to
     Strapi's internal schema, so it needs its own tests per Strapi upgrade.
- **Query handling:** parse only the operators the contract lists; reject
  anything else with 400, so a public-site change that needs a new operator
  fails loudly instead of returning wrong data.
- **Tenant isolation:** every query is filtered by the `tenant` parameter in
  one place; there is no unscoped path.

## The test that decides "done"

The built site must come out identical:

1. Record the reference: run the public-site build against Strapi and keep
   `out/` (or `NEXT_DIST_DIR`) plus the JSON of every read request (a fixture
   set covering `dgahub` and one gov-portal tenant, both locales).
2. **Contract test:** replay every recorded request against the Rust engine;
   responses must be equal after sorting keys and dropping `id`, `createdAt`,
   `updatedAt`.
3. **Build test:** build public-site with `STRAPI_URL` pointing at the Rust
   engine; diff the two exports file by file. Pass = no differences apart from
   Next's build id (`_next/static/<buildId>/`, `BUILD_ID`, the build id inside
   HTML) — content, HTML, `search-index.json`, `sitemap.xml`, `/data/*.json`
   and `.csv` byte-identical. `scripts/check-export.mjs` must pass.
4. Run both tests in CI on every change to the engine, public-site's
   `lib/cms.ts`, or Strapi's content types.

## Milestones (rough effort)

| # | Milestone | Effort |
|---|---|---|
| 1 | Fixture recorder (built as a recording proxy, `tools/record-proxy.mjs`, so public-site needs no change) — **done** | 1 day |
| 2 | Snapshot exporter from Strapi (published, per tenant/locale) — **done** (`tools/export-snapshot.mjs`) | 1–2 days |
| 3 | Rust server: tenants, pages, slugs, menu, articles, FAQ, services, datasets, home-pages; contract test green — **done** (all collections the build reads) | 4–6 days |
| 4 | Media passthrough; build test identical for `dgahub` — **done** (all Strapi tenants) | 1–2 days |
| 5 | gov-portal tenant identical; CI job; docs — **done** (`dga` and `pea` identical; `tools/build-test.mjs`; `.github/workflows/rust-engine.yml`, not yet run on GitHub) | 2–3 days |
| 6 | ~~(Optional) live Postgres mode with per-upgrade tests~~ — dropped: replaced by the Rust engine's own store (`target-architecture.md`, track R) | — |

Risks: Strapi's populate output has quirks (nested component ids, media
format objects) that the snapshot must reproduce exactly; the build test
catches them. Handover (Q-11) decides whether this belongs in the DGA
deliverable at all.
