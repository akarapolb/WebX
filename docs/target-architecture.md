# WebX target architecture: Studio, WebX control plane, three engines

Status: direction decided 2026-11-22. This is the final architecture; the
plan below is how to get there from today. Off the DGA critical path: the
DGA hub ships on Strapi as it is now, and stays a valid setup of the target.

## The target

```
              Editors                               Visitors
                 │                                     │
                 ▼                                     ▼
        ┌─────────────────┐                  public-site (static build,
        │   WebX Studio   │                  per tenant template)
        │  (the only UI)  │                       │            │
        └────────┬────────┘                       │ content    │ tenants, runtime
                 │                                │ (build)    │ (build + browser)
                 ▼                                │            ▼
   ┌──────────────────────────────┐               │   ┌──────────────────────┐
   │      WebX control plane      │◄──────────────┼───┤ (same control plane) │
   │ tenants · identity · roles · │               │   └──────────────────────┘
   │ governance · bookkeeping ·   │               │
   │ runtime routes               │               │
   └──────┬───────────┬───────────┘               │
          │           │ jobs, schedules, snapshots │
          │           ▼                            │
          │   ┌──────────────────────┐             │
          │   │ Agent worker         │  model: LiteLLM gateway
          │   │ (MicroAgent loop)    │  tools: Studio's governed tools
          │   └──────────────────────┘             │
          │ engine adapter (one contract)          │
          ▼           ▼            ▼               │
     Rust engine   Strapi      WordPress ◄─────────┘
     (WebX's own)  (optional)  (optional)
```

The customer chooses the engine **per tenant** (`tenant.engine`), and one
deployment can mix engines. Studio and the control plane are the same
whichever engine is chosen; an engine only stores and serves content.

| Part | Owns | Does not own |
|---|---|---|
| **WebX Studio** | All editing screens (Visual Builder, entries, media, releases, reviews, users, audit, agent) | Data: it calls the control plane and, through it, the engines |
| **WebX control plane** | Tenant registry; editors' identity (users, login, MFA, SSO); roles, custom roles and field policies; governance (permissions, review and release rules, audit log); bookkeeping (page versions and templates, menus, consent logs, agent threads, jobs and schedules); assistant embeddings; the public runtime routes (forms, captcha, consent, search stats, assistant, tenant contact); the rebuild trigger | Site content |
| **Agent worker** | Running the assistant's background jobs and schedules: it drives [MicroAgent](https://github.com/akarapolb/MicroAgent), a Rust agent loop with no I/O of its own (plan approval, tool risk classes, call limits, resumable snapshots, memory, skills, triggers), and supplies its three connections: the model (through the LiteLLM gateway), the tools (Studio's governed tools, so tenant scoping, custom roles and field policies apply unchanged) and the approvals | Data: jobs, schedules, threads, snapshots and memory notes are stored in the control plane; the model itself |
| **Engine** (Rust, Strapi or WordPress) | A tenant's content: entries, drafts and publish, locales, blocks, media; the read API the public-site build uses | Users, tenants, permissions, bookkeeping, runtime routes |
| **public-site** | Rendering | Reads content from the tenant's engine, and tenants and runtime routes from the control plane |

Choices a customer makes:

| Setup | Runs | Fits |
|---|---|---|
| Rust | Studio, control plane, Rust engine, one database | Smallest footprint; no Node CMS; no GPL CKEditor packages (R-15); air-gapped builds from a snapshot |
| Strapi | Studio, control plane, Strapi | Teams that want Strapi's ecosystem or already run it (DGA today) |
| WordPress | Studio, control plane, WordPress | Organisations already on WordPress (ORST, Royal Society) |

## Where we are today

| Concern | Today | Target |
|---|---|---|
| Tenant registry | Strapi (`api::tenant`), read by public-site through `/api/tenants/keys` and `/resolve` | Control plane |
| Studio's records | Strapi, for every tenant, WordPress ones included (`BOOKKEEPING_UIDS` in `webx-studio/lib/cms/governance.ts`: audit log, field policies, custom roles, releases, reviews, page versions, page templates, menu items, consent logs, agent threads, jobs and schedules) | Control plane |
| Editors' login | Per engine: Strapi admin users or WordPress application passwords; Studio holds the engine's token in its cookie | Control plane; engines get a per-tenant service credential, and the acting editor is passed along (the pattern `withServiceToken` and `withActingSession` in `webx-studio/lib/strapi.ts` already use for background jobs) |
| Governance | Studio (`governance.ts`); Strapi's own hooks in `strapi-cms/src/index.ts` repeat tenant isolation as a backstop | Control plane; engine-side isolation kept as a backstop |
| Runtime routes | Strapi for Strapi tenants; WordPress plugins for WordPress tenants (`lib/publicCmsRule.mjs`) | Control plane, for every engine |
| Assistant embeddings | Strapi (`api::doc-embedding`) or pgvector (`webx-studio/lib/vectorstore.ts`) | Control plane (pgvector or its own table) |
| Rust engine | Read-only copy of Strapi (`rust-engine/`, snapshot mode) | A full engine with its own store, write API and media |

So most of the work is moving things **out of Strapi into the control plane**.
Once that is done Strapi and WordPress are pure content engines, and the Rust
engine only has to match them, which is much smaller than building a Strapi
replacement: no users, no login, no roles, no runtime routes.

## Size of what moves out of Strapi

Counted in `strapi-cms/` on 2026-11-22: 48 content types (25 with draft and
publish, 11 localized), 37 components; about 3,700 lines of custom code
(`src/index.ts` 352 lines of isolation hooks and audit; controllers, routes and
services 2,491; utilities and middlewares 902: answer, retrieval, LLM, captcha,
MFA/TOTP, PII encryption, rate limit, tenant, SEO, GA4). Of the 48 types, 13
are Studio's bookkeeping, the tenant type is the registry, and the form
inboxes, consent and search-stat types belong to the runtime routes: those go
to the control plane. The rest are site content and stay in the engine.

On the Studio side, the engine adapters are small (`strapi.ts` 324 lines,
`wordpress.ts` 570); `governance.ts` (3,418 lines) already holds the
permission logic and becomes part of the control plane.

## Decisions to make

| # | Decision | Recommendation |
|---|---|---|
| D1 | Is this in the DGA deliverable? (Q-11, handover) | No: a WebX product track. DGA keeps Strapi, which is one of the three setups of the target. |
| D2 | Where the control plane runs | A separate service (`webx-control`), not inside Studio's Next.js server: public-site and visitors' browsers must reach the tenant registry and runtime routes, and Studio should not be public. Written in Rust in the same Cargo workspace as the engine, sharing the store, auth and isolation code; the assistant's background loop runs in a separate worker built on MicroAgent (D13), not in Node as first proposed. |
| D3 | Database | Postgres in production, SQLite for development and CI, same `sqlx` code. The control plane and the Rust engine may share one Postgres (separate schemas) in the Rust setup. |
| D4 | Engine contract | The engine contract (`engine-contract.md`) shrinks to content only: read API (section 6) and the content part of the write API (section 8: schema, entries, publish, media). Users and auth move to a new control-plane section. The read API keeps Strapi's format for Rust, so public-site does not change. |
| D5 | Content model | Keep Strapi's `schema.json` format as WebX's content-model format, with the source of truth in a top-level `content-model/` folder; Strapi's copies are generated from it and CI fails if they differ; the Rust engine reads it directly; WordPress keeps its fixed post-type registry. |
| D6 | WordPress-native forms (Phase 7: polls, complaints, applications, breaking news in WordPress plugins) | Move the form inboxes to the control plane like Strapi's; breaking news is content and stays in WordPress. |
| D7 | Migrating existing tenants | Move bookkeeping and identity for `dga`, `pea`, `dgahub`, `orst`, `royalsociety` to the control plane while their content stays where it is; no tenant has to change engine. |
| D8 | First Rust tenant | A new test tenant on the `dgahub` template; then any customer that chooses the Rust setup. |
| D9 | Unknown or missing tenant (today every engine falls back to `dga`, see `engine-contract.md` section 2) | Make an explicit unknown key return an empty result and let only a request that names no tenant fall back, so a typo never serves another organisation's content. Needs the conformance suite (C1) first, because it changes Strapi's behaviour as well as the engine's. |
| D10 | Identity (C4), decided 2026-11-24 | webx-control keeps users, workspace membership and roles and signs people in through OIDC providers (Keycloak and the like, as Studio's per-tenant SSO already does). It stores no passwords. A customer with no identity provider needs one; a local-password option can be added later if wanted. |
| D11 | Session (C4), decided 2026-11-24 | webx-control issues a short-lived signed token (user, workspace, role). Studio and every engine verify it with a public key, so no engine has its own login. |
| D12 | Visitor-facing routes (C5), decided 2026-11-24 | They live in webx-control (consent, complaints, applications, forms, tenant lookup for the browser): it validates, rate-limits, stores and notifies, whatever engine a workspace uses. Engines stop serving them. |
| D14 | Form attachments (C5), default taken 2026-11-25, open to change | A complaint's or application's file is kept in webx-control's own database, encrypted with the personal-data key, at most 5 MB, documents and images only with their content checked, served only to Studio as a download. An S3-compatible object store can replace the table later without changing the routes. |
| D15 | E-mail from the control plane (C5), default taken 2026-11-25, open to change | webx-control sends the acknowledgements and the staff notice itself over SMTP (`WEBX_SMTP_URL`), through an outbox written before the send: encrypted while it waits, wiped once sent, retried with growing waits. Strapi's email plugin stops being needed. |
| D13 | Assistant worker (C5), decided 2026-11-24 | A separate worker service, built on [akarapolb/MicroAgent](https://github.com/akarapolb/MicroAgent) (a Rust agent loop with no I/O: plan approval, tool risk classes, limits, resumable snapshots, memory, triggers, skills), not the Node worker D2 first proposed. The worker implements MicroAgent's `Host` (model call through the LiteLLM gateway, tools through Studio's governed tools); jobs, schedules and snapshots are stored in webx-control. |

## Plan

Two tracks. The control-plane track comes first because it decides what an
engine has to do; the Rust track can start alongside it with C1 and R1–R2,
which do not depend on it.

### Track C: WebX control plane (about 7–10 weeks)

| # | Milestone | Effort |
|---|---|---|
| C1 | Engine conformance suite: one engine-neutral test set for the adapter interface (contract section 9.3 says it is still to be written), run against Strapi and WordPress | 3–4 days |
| C2 (done 2026-11-23: `webx-control/` with the tenant registry, public routes and admin API, parity test and build test in CI; `WEBX_CONTROL_URL` in public-site; Studio's own tenant routing and Postgres are not done) | `webx-control` service and store; tenant registry moved, with `/tenants/keys` and `/tenants/resolve` served by it; public-site reads tenants from it; build test identical | 6–8 days |
| C3 (started 2026-11-23: the audit log, then 2026-11-24 page templates and page versions, are in webx-control, with Studio switching by `WEBX_CONTROL_URL` + `WEBX_CONTROL_SERVICE_TOKEN` and migration tools; custom roles are stored there too but not used until Strapi and WordPress enforcement read them from there; the other 9 types are not moved) | Bookkeeping moved: the 13 `BOOKKEEPING_UIDS` types behind one control-plane interface in `governance.ts`; data migrated from Strapi; audit log written by the control plane only | 8–12 days |
| C4 (started 2026-11-24: users, memberships and Ed25519 signed tokens with a published key, tested on the real binary; Studio sign-in through it, user migration and engine verification are not done) | Identity: users, login, sessions, MFA, SSO and roles in the control plane; Studio logs in to WebX, not to an engine; engines get per-tenant service credentials with the acting editor passed along; e2e `user-management`, `mfa-enforcement` and `cross-tenant-isolation` pass for Strapi and WordPress tenants | 10–15 days |
| C5 (started 2026-11-24: `webx-agent`, the worker that drives MicroAgent with a model client, a tool gateway, autonomy levels and resumable snapshots, tested against mocks; Studio's side of the gateway is built (webx-studio/lib/agent/toolGateway.ts and app/api/internal/agent-tools/); the job queue with leasing is in webx-control (`jobs.rs`) and the worker serves it (`webx-agent serve`), tested end to end on the real binaries; the schedule store with due/advance/disable is there too (`schedules.rs`), and Studio can use both: `WEBX_CONTROL_QUEUE=1` (with the control URL and token) moves job creation, listing, control, the workers' leases and the schedule tick to the control plane (`webx-studio/lib/cms/queue-store.ts`), unit-tested, and its list, read and cancel run against a live Studio in CI (`e2e/tests/queue-control-plane.spec.ts`); existing Strapi jobs are not copied; the first runtime route is built end to end, `POST /api/consent-logs` (`visitors.rs`: size limits, per-address rate limit, CORS for the public sites' origins, stored as given, a summary for the dashboards), with public-site's `PUBLIC_CONTROL_URL` to reach it, Studio's Cookie Consent page and Strapi's analytics reading the control plane's rows next to the engine's, and a live CI run of the Studio reads (`e2e/tests/consent-control-plane.spec.ts`); search statistics are the second (`search_stats.rs`, with Studio's search insights reading both sources) the captcha the third (`captcha.rs`), and the form inboxes the fourth (`forms.rs`, `pii.rs`, `files.rs`, `outbox.rs`, `mailer.rs`: the four types with personal data encrypted at rest in Strapi's format, references, tracking, captcha, rate limits, file attachments encrypted at rest (D14), mail through an outbox over SMTP (D15), read and edited through the records API; 90+ unit tests and a real-binary test with a fake mail server; not yet Studio's switch to them and the migration from Strapi); the assistant is not built) | Runtime routes moved: captcha, rate limit, consent logs, search stats, forms with PII encryption, tenant contact, the assistant worker built on MicroAgent (D13: the `Host` implementation, job and schedule storage in the control plane, MicroAgent triggers for schedules, snapshots for resuming after a restart); `PUBLIC_CMS_URL` points at the control plane for every engine | 10–15 days |
| C6 | Strapi and WordPress as pure content engines: their copies of the moved types and routes switched off; contract rewritten (D4); rebuild trigger from the control plane | 3–5 days |

### Track R: Rust engine as a full engine (about 4–6 weeks)

No users, login or runtime routes: the control plane provides those.

| # | Milestone | Effort |
|---|---|---|
| R1 (done 2026-11-23: `content-model/` with `sync.mjs check|write|adopt`, CI job `content-model`, the Rust exporter reads it; Studio still reads Strapi's content-manager) | `content-model/` as the source of truth (D5); Strapi's copies generated; CI check | 2 days |
| R2 (done 2026-11-23) | Store and database mode for reads: snapshot imported into the store; today's build test identical against the database mode | 5–7 days |
| R3 (done 2026-11-23 as engine write API, per-tenant tokens and adapter `rust.ts`, conformance 11/11; not yet done: unique slug rule, wiring `engine: "rust"` into governance and the tenant type, which wait for C2) | Content write API: entries, drafts and publish, locales, validation against the content model, unique slug per tenant and locale, tenant isolation, service-credential auth; Studio adapter `rust.ts`; `engine: "rust"` in the tenant type and in Studio's engine resolution | 8–12 days |
| R4 (done 2026-11-23: upload, library, edit, delete per tenant; image resizing and dimensions not yet) | Media: upload, the same resized formats and object shape as Strapi (`thumbnail`, `small`, `medium`, `large`), list, update, remove; local folder, S3-compatible later | 4–6 days |
| R5 (done 2026-11-23 as `rust-engine/tools/rust-tenant-test.mjs`: the `dgahub` tenant written only through the write API, registered in webx-control as engine `rust`, built into a site; public-site accepts engine `rust` and `WEBX_ENGINE_URLS` per-tenant engine URLs; media URLs of such a tenant are made absolute against its own engine, covered by `public-site/tests/engineUrls*.test.ts`) | First Rust tenant (D8): Strapi-to-Rust content migration tool (drafts and media included); conformance suite (C1) and e2e `studio-roundtrip` pass for it | 4–6 days |

Snapshot mode stays: an engine of any kind can export a snapshot for an
air-gapped public-site build, served by the read-only Rust binary.

### Order

1. C1 and R1 (both small, and everything else is tested with them).
2. C2, with R2 alongside.
3. C3 and C4: the large moves out of Strapi.
4. R3–R5 once C4 has fixed how engines are called (service credential and
   acting editor).
5. C5 and C6.

## The tests that decide "done"

- **Conformance:** the engine suite (C1) passes for Rust, Strapi and WordPress.
- **Read side:** `rust-engine/tools/build-test.mjs` identical for each moved
  piece (tenants from the control plane, content from the Rust database mode).
- **Same site whatever the engine:** a tenant's content migrated from Strapi
  to Rust builds the same site.
- **End to end:** `studio-roundtrip`, `user-management`, `mfa-enforcement` and
  `cross-tenant-isolation` pass for one tenant of each engine.

## Risks

- **MicroAgent is the user's own young crate** (one dependency, MIT). Pin it to a commit in `Cargo.toml`, keep the `Host` adapter thin, and treat its plan approval and risk classes as the assistant's safety boundary: a tool's risk class must be set from the tenant's governed permissions, never left at a default. Studio's existing agent tests (`webx-studio/tests`, `eval/`) are the behaviour the worker has to keep.

- **Identity is security-critical.** Moving login, MFA and SSO out of the
  engines makes them WebX's code to secure. Security review before C4 ships.
- **Engines lose their own users.** Editors no longer log in to Strapi's admin
  or WordPress's dashboard directly. A customer that wants that keeps it, but
  then the engine's own permissions apply, outside WebX governance; that has to
  be documented.
- **Hidden behaviour in Strapi.** Component ids, media format objects, relation
  shapes, i18n defaults. The build test covers the read side; C1 must cover
  the write side before R3.
- **Migration of live tenants.** C3 and C4 move live DGA, PEA, ORST and Royal
  Society records. Each move needs a dry run, a rollback and a check that the
  built site is unchanged.
- **Three engines to keep in step.** Every new content type or block must work
  in all three. D5 keeps the model in one place; C1 checks the behaviour.

## Effect on the existing plans

- `rust-engine-plan.md`: milestones 1–5 stay as built (snapshot mode).
  Milestone 6 (reading Strapi's Postgres directly) is dropped: the Rust engine
  gets its own store instead.
- `engine-contract.md`: rewritten in C6 (D4). Until then it describes today.
- `hosting-plan.md`: gains the `webx-control` service in every setup.
