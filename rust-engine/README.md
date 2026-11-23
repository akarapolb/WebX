# webx-read-engine

A read-only stand-in for Strapi's public REST API, so a public-site build can
run without a live CMS (plan: `../docs/rust-engine-plan.md`; contract:
`../docs/engine-contract.md`, sections 6 and 9).

- One small binary (Rust, axum), starts in well under a second.
- Serves a **snapshot** of published content exported from Strapi; nothing
  else. No writes (any `POST`/`PUT`/`DELETE` → 405), no drafts, no admin, no auth.
- Understands only the query subset public-site uses; anything else → 400
  with the reason, so a new public-site query fails loudly instead of
  silently getting different data.
- Serves `/uploads/*` from Strapi's upload folder (or a copy of it).

Strapi stays the editing engine (Studio writes to it) and keeps the visitor's
runtime routes (assistant, forms, consent, captcha, search analytics).

## Use

```sh
# 1. export published content from a running Strapi (seconds)
node tools/export-snapshot.mjs                    # -> snapshot/snapshot.json

# 2. run the engine
cargo build --release
target/release/webx-read-engine --port 1338 --snapshot snapshot/snapshot.json --uploads ../strapi-cms/public/uploads

# 3. build public-site against it
cd ../public-site && STRAPI_URL=http://localhost:1338 npm run build
```

`snapshot/` and `fixtures/` are git-ignored: they are content, not code.
Export again after content changes (a publish), then rebuild.

## How it decides what to return

Each entry is exported with "one level inside" populated (media, relations,
and components / dynamic zones with `populate=*` inside), which is the
deepest shape public-site asks for. Per request the engine:

1. picks the rows for `?tenant` and `?locale` (unknown or missing tenant →
   the default tenant, `dga`, exactly like Strapi's tenant middleware);
2. applies `filters` (`$eq`, `$ne`, `$null`, `$notNull`, `$or`, `$and`,
   relation paths such as `tenant.key`), compared like SQLite does;
3. sorts (`sort=field:asc|desc`, several allowed; NULL first ascending),
   stable on export order (`id` ascending);
4. paginates (`pagination[page]`, `pagination[pageSize]`, default 25, max
   100, as in `strapi-cms/config/api.ts`);
5. trims each entry to `fields` and to what `populate` names, using the
   schema map the exporter writes from strapi-cms's own schema files;
6. returns Strapi's `{data, meta}` envelope. One Strapi quirk is kept on
   purpose: in a sorted list the sort fields come first in each entry, so the
   JSON (and the built site) is byte-identical.

`/api/tenants/keys` and `/api/tenants/resolve` are served from the snapshot
as Strapi answered them. `/api/<plural>/<documentId>` returns one entry.

## Tests

```sh
cargo test                                   # query parsing, filters, trimming (unit)

# contract + build test, all steps in one command (needs a running Strapi
# with content on 1337 and the release binary); CI runs exactly this:
node tools/build-test.mjs

# the same steps by hand:
node tools/record-proxy.mjs &                # records every build read, :1338 -> :1337
(cd ../public-site && STRAPI_URL=http://localhost:1338 NEXT_DIST_DIR=.next-ref npm run build)
curl localhost:1338/__save                   # write fixtures/requests.json; then stop the proxy
node tools/export-snapshot.mjs
target/release/webx-read-engine --port 1338 &
node tools/contract-test.mjs                 # every recorded request: same status and JSON
(cd ../public-site && STRAPI_URL=http://localhost:1338 NEXT_DIST_DIR=.next-eng npm run build)
node tools/build-diff.mjs ../public-site/.next-ref ../public-site/.next-eng
```

Both builds use the same address (`:1338`, proxy then engine), so media URLs
baked into pages are the same. `build-diff` ignores Next's random build id and
the order of Next's React Server Components rows inside pages: that order
changes between any two builds, even two against the same engine. Pages must
otherwise match exactly; a one-word change is reported.

Next keeps its fetch cache in `public-site/.next/cache` whatever
`NEXT_DIST_DIR` says, keyed by URL, so by hand delete
`../public-site/.next/cache/fetch-cache` before each build, or the second
build gets the first build's answers. `build-test.mjs` does that, and also
runs the engine build through the recording proxy (engine one port up) and
fails unless it read the same paths as the reference build.

Last run (2026-11-22, `build-test.mjs`, cold cache): contract 192/192
identical; the engine build read the same 192 paths; build 596 files, 0
differences (506 byte-identical, 90 differing only in Next's row order); per
tenant `dga` 437, `pea` 289, `dgahub` 368 files, 0 differences.

## Not covered (yet)

- WordPress tenants (ORST, Royal Society) read WordPress, not this engine.
- Editing: content still comes from Strapi. In the target architecture
  (`../docs/target-architecture.md`) this becomes a full engine, one of three
  (Rust, Strapi, WordPress) behind the WebX control plane, with its own store,
  content write API and media; snapshot mode stays for air-gapped builds.

## CI

`.github/workflows/rust-engine.yml` runs `cargo test`, then boots a freshly
seeded Strapi (throwaway sqlite DB and secrets, as in `ci.yml`) and runs
`tools/build-test.mjs`: contract test plus build diff for the whole site and
for each Strapi tenant (`dga` and `pea` on the gov-portal template, `dgahub`).
It runs only when the engine, public-site's Strapi reading code
(`lib/cms.ts`, `lib/publicCms*`, `next.config.mjs`) or Strapi's content types,
components or API settings change, or by hand (workflow_dispatch). There is no
WordPress in CI; the ORST and Royal Society pages build from their fallbacks
in both builds, so they are compared too but say nothing about WordPress.
