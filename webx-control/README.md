# webx-control

The WebX control plane (`../docs/target-architecture.md`, decision D2). It owns
what is about the organisations rather than their content: today the **tenant
registry** (milestone C2); identity, bookkeeping and the visitors' runtime
routes follow in C3 to C5. Content engines (Rust, Strapi, WordPress) keep only
content.

One small Rust binary (axum, SQLite in the binary).

```sh
cargo build --release

# fill the registry once from a snapshot (what Strapi answered for the tenant routes)
target/release/webx-control import --snapshot ../rust-engine/snapshot/snapshot.json --db control.db

WEBX_CONTROL_ADMIN_TOKEN=<secret> target/release/webx-control --db control.db --port 1400
```

## Public routes (no auth)

These are the routes public-site reads at build time, answered exactly as
Strapi answers them:

| Route | Answer |
|---|---|
| `GET /api/tenants/keys` | `{data: [{key, engine, publicTemplate}]}`, in the order the tenants were created |
| `GET /api/tenants/resolve?tenant=<key>` | `{data: {key, name, brand, contact, social, footerColumns, ...}}` |

A request that names no tenant gets the first one created. An unknown key gets
the first tenant's answer too, which is what Strapi and every engine do today
(`../docs/engine-contract.md` section 2) and what public-site's builds rely on
(its `/dgahub/...` routes ask for a tenant this registry may not list). Start
with `--strict-tenants` for decision D9: an unknown key is then a **404**, never
another tenant's data. D9 becomes the default once every engine and the build
agree. Point a public-site build at it with `WEBX_CONTROL_URL=http://host:1400`;
without that variable public-site reads the tenant routes from the content
engine as before. The browser's own tenant lookup (`useTenantContact`) still uses
the public CMS address until the runtime routes move (C5).

## Admin API

`Authorization: Bearer <WEBX_CONTROL_ADMIN_TOKEN>`; without that variable the
admin API is off (503). Only a hash of the token is held in memory.

| Call | Meaning |
|---|---|
| `GET /admin/tenants`, `GET /admin/tenants/<key>` | the registry, with each tenant's `engineUrl` |
| `PUT /admin/tenants/<key>` body `{engine, publicTemplate, engineUrl?, resolve?}` | create (201) or replace (200); `engine` is `strapi`, `wordpress` or `rust`; `key` is 2 to 32 characters of `a-z 0-9 -` |
| `DELETE /admin/tenants/<key>` | remove |

`GET /_health` reports `served`, the number of public tenant requests answered,
so a test can tell the service was really used.

## Audit log (C3, first part)

The audit trail (who did what in which workspace, when; also the agent's run
and token counts that the plan limits read) is stored here, append-only, in
the shape of Strapi's `audit-log` rows. It is behind a service token:
`WEBX_CONTROL_SERVICE_TOKEN` (the `/internal` API is off without it; the admin
token does not open it).

| Call | Meaning |
|---|---|
| `POST /internal/audit` body `{data: {action, tenantKey, adminEmail, ...}}` | append a row (`action` required) |
| `GET /internal/audit?filter=field:op:value&q=&sort=at:desc&page=&pageSize=` | list; ops `eq ne contains gte lte`; fields are the row's; `pageSize` up to 500 |
| `GET /internal/audit/<documentId>` | one row |
| `POST /internal/audit/import` body `[row, ...]` | migration: rows keep their `documentId` and times; ones already there are skipped |

There is no update or delete. **Studio** (`webx-studio/lib/cms/audit-store.ts`)
switches every audit read and write to this when `WEBX_CONTROL_URL` and
`WEBX_CONTROL_SERVICE_TOKEN` are both set; its tenant scoping, the Audit Log
screen and the monthly agent limits work unchanged. Until then audit stays in
Strapi. To move the history first:

```sh
STRAPI_URL=... STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... WEBX_CONTROL_URL=... WEBX_CONTROL_SERVICE_TOKEN=...   node tools/migrate-audit.mjs [--dry-run]
```

`node tools/audit-test.mjs` checks the API on the real binary and runs Studio's
adapter tests against it. The other bookkeeping types (releases, reviews,
custom roles, agent jobs and so on) are still in Strapi, except those under Records below.

## Records (C3, second part)

Page templates and page versions are stored here as JSON documents, one
`records` table keyed by collection, behind the same service token:

| Call | Meaning |
|---|---|
| `POST /internal/records/<collection>` body `{data}` | create; the id is chosen here |
| `GET /internal/records/<collection>?filter=field:op:value&sort=field:dir&page=&pageSize=` | list; ops `eq ne contains gte lte`; fields are the record's own (no relation paths) |
| `GET`, `PUT` (merge, `null` clears), `DELETE /internal/records/<collection>/<documentId>` | one record |
| `POST /internal/records/<collection>/import` body `[record, ...]` | migration: records keep their `documentId` and times; ones already there are skipped |

`COLLECTIONS` in `src/records.rs` lists what exists: `custom-role`, `page-template`, `page-version`.
**Studio** (`webx-studio/lib/cms/records-store.ts`) uses it for page templates and page
versions with the same two variables as audit. Custom roles can be stored here but Studio does
**not** use that yet: Strapi's own enforcement and the WordPress mu-plugin read them from
Strapi, so they move once that lookup is served from here. To move the existing templates first:

```sh
STRAPI_URL=... STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... WEBX_CONTROL_URL=... WEBX_CONTROL_SERVICE_TOKEN=...   node tools/migrate-records.mjs [--dry-run]
```

Run it before switching: a shared template (no workspace) that is only in Strapi is invisible once Studio reads here.

## Tests

```sh
cargo test                                                  # registry rules (unit)
node tools/parity-test.mjs --reference http://localhost:1337   # same answers as Strapi; admin API; restart
node tools/build-test.mjs --no-check-export                # a site build reading tenants from here is identical
```

`parity-test` compares the tenant list and `resolve` for every tenant in both
locales with the reference (a live Strapi in CI) and exercises the admin API.
`build-test` builds public-site twice against the same engine, once with
`WEBX_CONTROL_URL` set, requires that this service answered requests, and runs
`rust-engine/tools/build-diff.mjs` on the two. CI runs all three (the Rust
engine workflow).

## Not yet

Identity and login (C4), bookkeeping such as the audit log, releases and
reviews (C3), the visitors' runtime routes (C5), and Studio reading the tenant
registry from here for its own routing. The database file is one SQLite file;
Postgres for production is decision D3.
