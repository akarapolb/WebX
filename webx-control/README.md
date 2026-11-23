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
