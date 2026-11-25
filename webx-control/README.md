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
engine as before. The browser's own tenant lookup (`useTenantContact`) follows
public-site's `PUBLIC_CONTROL_URL` when that is set (it is a visitors' route, below), and the CMS address until then.

## Visitors' routes (C5, decision D12)

What a visitor's browser calls without signing in. Anonymous, rate-limited per address, write-only.

| Route | Meaning |
|---|---|
| `POST /api/consent-logs?tenant=<key>` body `{data: {consentId, action, categories, language, path, userAgent}}` | log a cookie choice (PDPA evidence); `201 {data: {documentId, createdAt}}` |
| `POST /api/search-stats/log?tenant=<key>` body `{q, locale, results}` | count one search on the public site, anonymously; `204` whether or not it was kept |

The choice is stored as given in the `consent-log` records collection, stamped with the workspace; text is cut at its limit
(`path` and `userAgent` at 512 characters), unknown fields are dropped, `categories` must be an object of at most 2 KB, an
`action` is required, and a body past 16 KB is refused (413). A tenant that is not registered is filed under the first one, as
Strapi does, or refused (404) with `--strict-tenants`. One address may log 30 times a minute (429 after that). The address is the
first entry of `X-Forwarded-For`, so run this service behind a proxy that sets it; without one every caller shares one limit.
**Search statistics** (a port of `strapi-cms/src/api/search-stat`): one row per workspace, language and normalised query, with
`count`, the last `results`, `zeroCount` (how often it found nothing) and `lastAt`; never who searched. The query is trimmed,
single-spaced, lower-cased and cut at 100 characters; an empty one, one with an e-mail address in it, or one with a number of
9 or more digits (a phone, national ID or account number; a list of 4-digit years such as `2566-2570` is fine) is **dropped
without being stored, with the same 204**, so a caller cannot probe what was kept. `locale` is `en` or else `th`; `results` is
clamped to 0..10000. A workspace keeps at most 20,000 different queries (a new one past that is dropped; known ones still
count), a body past 4 KB is refused (413), and an address may search 30 times a minute (its own allowance, apart from the
consent log's). Read with `GET /internal/records/search-stat?filter=tenantKey:eq:<key>&sort=count:DESC&pageSize=500` (service
token; filters `tenantKey` and `locale` eq, `query` contains; sorts `count` `results` `zeroCount` `lastAt` `query` `createdAt`),
which is read-only here. Studio's search insights add these counts to the engine's per query
(`webx-studio/lib/cms/stat-merge.ts`, the top 1000 queries of each); one Unicode step of Strapi's normaliser (NFC) is not applied.

**CORS.** The public site is on another origin than this service, so a JSON post is preflighted and the answer has to name
that origin. Every `/api/*` route a browser calls (these and the tenant lookups; not `/api/auth/*`, `/internal` or `/admin`)
answers `OPTIONS` with 204 and sends `Access-Control-Allow-Origin` for an allowed origin: the local development ones Strapi
allows (`http://localhost:3100`, `:8080`, `:8095`, `http://127.0.0.1:8080`) and the comma-separated
`WEBX_PUBLIC_SITE_ORIGINS` (a trailing slash is ignored; `*` allows any origin, safe here since these routes are anonymous and
take no cookies). Any other origin gets no permission, so its browser blocks the post. Set it to the public sites' own
addresses, the same variable Strapi's CORS reads.

**Reading the log back** (service token):

| Route | Meaning |
|---|---|
| `GET /internal/records/consent-log?filter=tenantKey:eq:<key>&sort=createdAt:DESC` | list, as any records collection |
| `GET /internal/consent/summary?tenant=<key>&from=<iso>&before=<iso>` | `{data: {total, accept, reject, custom}}` for one workspace (no `tenant`: all) and a creation window, from inclusive, before exclusive; counted as Strapi's analytics counts (an action containing `accept`, or `all`/`opt-in`, is an accept; containing `reject`, or `none`/`opt-out`, a reject; the rest custom) |

**Switching over.** Nothing is copied. Point public-site at this service with `PUBLIC_CONTROL_URL=https://control.example.go.th`
(its cookie banner and the contact lookup then call here; unset, they call the CMS as before) and give Strapi and Studio the same
`WEBX_CONTROL_URL` and `WEBX_CONTROL_SERVICE_TOKEN` they use for the audit log. Then **Studio's Cookie Consent page lists the
choices from both places** (`webx-studio/lib/cms/consent-merge.ts`: the control plane's and Strapi's, newest first, scoped to the
workspace; a page may reach 1000 rows deep) and **Strapi's analytics dashboard and monthly report add this service's counts to
its own** and read the audit log from here (`strapi-cms/src/utils/control-plane.ts`; an unreachable control plane is logged and
left out). Old evidence therefore stays where it was and stays visible, and the public site can be switched at any moment. Studio
cannot edit or delete a choice held here. Strapi's own copy of the table goes in C6, after an import (`records import` keeps the
ids) and with the dual read turned off, or the migrated rows would be counted twice.

Not here yet: the assistant, captcha and the forms (with their attachments, whose storage is not decided).

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

## Identity (C4, first part)

Decisions D10 and D11. webx-control holds **users** and their **memberships** (workspace and role) and issues the
**tokens** that prove them. It stores no passwords: people sign in at an OIDC provider (Studio does the OIDC step
today), and Studio then asks for a token here.

| Call | Meaning |
|---|---|
| `PUT /admin/users/<email>` body `{name?, disabled?, superAdmin?, memberships: [{tenantKey, role}]}` | create (201) or replace (200); email is kept lowercase; `superAdmin` marks a user tied to no workspace (Studio's unscoped admin), who may be issued a token for any workspace |
| `GET /admin/users`, `GET`, `DELETE /admin/users/<email>` | the users |
| `POST /internal/token` body `{email, tenantKey?}` (service token) | a signed token for a known, enabled user; with `tenantKey` only for that workspace, which they must belong to; 403 otherwise |
| `GET /.well-known/jwks.json` | the public key (Ed25519) engines and Studio verify tokens with |
| `GET /api/auth/me` with `Authorization: Bearer <token>` | who the token is for; 401 if it is bad, expired, or the user was disabled or deleted |

A token is a JWT signed with EdDSA: `iss` `webx-control`, `sub` the email, `tenants` `[{key, role}]`, `exp`. It lives
15 minutes (`--token-ttl <seconds>`). Disabling a user cuts them off at once at `/api/auth/me`; an engine that checks
only the signature honours a token until it expires, so engines that need instant revocation call `/api/auth/me`.
The signing key is made on first start and kept in the database; set `WEBX_CONTROL_SIGNING_KEY` (base64, 32 bytes)
to use your own, for example one shared by several instances. `node tools/identity-test.mjs` checks all of this on
the real binary, verifying the tokens with Node's own crypto and the published key. `node tools/migrate-users.mjs [--dry-run]` copies Strapi's admin users (name, active flag, workspaces from each
tenant's `adminEmails`, role as a slug; a super admin on no tenant becomes `superAdmin`) with their admin API; its mapping
is unit-tested (`node --test tools/users-map.test.mjs`). Not done yet, and the larger part of C4: Studio's session
trusting these tokens instead of Strapi's (with engines called by a service credential plus the acting editor), the
OIDC provider settings per workspace, MFA here, engines verifying tokens, custom-role assignments in the migration,
and the security review D10 and the plan require before it ships.

## Job queue (C5)

The assistant's background jobs, leased to workers in slices (decision D13). The rules are a port of the ones Studio's
workers use against Strapi (`strapi-cms/src/api/internal/controllers/agent-jobs.ts`), so the Rust worker
(`../webx-agent`) and the Node worker behave alike. All behind the service token.

| Call | Meaning |
|---|---|
| `POST /internal/jobs` body `{data: {tenantKey, ownerEmail, goal, ...}}` | queue a job (always `queued`; `notBefore` and `priority` allowed; other fields are kept) |
| `GET /internal/jobs?tenantKey=&ownerEmail=&runState=&page=&pageSize=`, `GET /internal/jobs/<documentId>` | list (newest first) and read |
| `POST /internal/jobs/claim` `{workerId, limit, caps, defaultCap}` | lease up to `limit` runnable jobs; `caps` is each workspace's running-job limit; one running job per owner |
| `POST /internal/jobs/heartbeat` `{documentId, leaseToken}` | extend the lease; answers `{ok, cancelRequested, pauseRequested}`; `ok: false` means the lease is gone |
| `POST /internal/jobs/checkpoint` `{documentId, leaseToken, checkpoint, checkpointSeq, eventSeq, progress, tokensUsed, events}` | save the run under the lease (also extends it); the newest 200 events are kept |
| `POST /internal/jobs/finish` `{documentId, leaseToken, runState, ...}` | end a slice as `queued`, `paused`, `done`, `failed` or `cancelled`; releases the lease |
| `POST /internal/jobs/control` `{documentId, action, answer?}` | a user's `cancel`, `pause`, `resume` or `answer`: a queued or paused job changes state, a running one gets a flag its worker hears at the next heartbeat |

A lease lasts 90 s. A worker that stops heartbeating loses it: the next claim requeues the job with backoff (30 s, doubling), or
pauses it when it crashed twice with no progress between (`stuck_crash`), or fails it after 5 attempts (`worker_lost`). The clock is
this service's, so workers' clocks do not matter. `node tools/jobs-test.mjs` checks it on the real binary, including two workers
claiming at the same moment and a restart in the middle of a job.

### Schedules

Recurring jobs, the store Studio's tick works against (port of `agent-schedules.ts`; working out the next run stays in Studio, which sends it as `nextRunAt`). Service token.

| Call | Meaning |
|---|---|
| `POST /internal/schedules`, `GET/PUT/DELETE /internal/schedules/<id>`, `GET /internal/schedules?tenantKey=&ownerEmail=` | save, read, change (bumps `runSeq`; `null` clears a field), delete, list |
| `GET /internal/schedules/due` | enabled schedules whose `nextRunAt` has come, soonest first (up to 50) |
| `POST /internal/schedules/advance` `{documentId, expectedSeq, nextRunAt, job?, skipReason?, consecutiveFailures?, countedJobId?}` | compare-and-set on `runSeq`: moves to the next run and, with `job`, queues that occurrence in the same transaction (one job per `idempotencyKey`); answers `{ok, jobId, existing?}` |
| `POST /internal/schedules/disable` `{documentId, expectedSeq, reason}` | turn off with a reason, if still enabled at that `runSeq` |

## Tests

```sh
cargo test                                                  # registry rules (unit)
node tools/parity-test.mjs --reference http://localhost:1337   # same answers as Strapi; admin API; restart
node tools/build-test.mjs --no-check-export                # a site build reading tenants from here is identical
node tools/visitors-test.mjs                               # the consent route: stored as given, limits, rate limit, CORS, summary, restart
```

`parity-test` compares the tenant list and `resolve` for every tenant in both
locales with the reference (a live Strapi in CI) and exercises the admin API.
`build-test` builds public-site twice against the same engine, once with
`WEBX_CONTROL_URL` set, requires that this service answered requests, and runs
`rust-engine/tools/build-diff.mjs` on the two. CI runs all three (the Rust
engine workflow).

## Not yet

Identity and login (C4), bookkeeping such as the audit log, releases and
reviews (C3), the rest of the visitors' runtime routes (C5: the assistant, search statistics, captcha, forms), and Studio reading the tenant
registry from here for its own routing. The database file is one SQLite file;
Postgres for production is decision D3.
