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
| D2 | Where the control plane runs | A separate service (`webx-control`), not inside Studio's Next.js server: public-site and visitors' browsers must reach the tenant registry and runtime routes, and Studio should not be public. Written in Rust in the same Cargo workspace as the engine, sharing the store, auth and isolation code; the assistant's answer logic first runs as-is in a small Node worker (it reuses `answer.ts`, `retrieval.ts`, `llm.ts`). |
| D3 | Database | Postgres in production, SQLite for development and CI, same `sqlx` code. The control plane and the Rust engine may share one Postgres (separate schemas) in the Rust setup. |
| D4 | Engine contract | The engine contract (`engine-contract.md`) shrinks to content only: read API (section 6) and the content part of the write API (section 8: schema, entries, publish, media). Users and auth move to a new control-plane section. The read API keeps Strapi's format for Rust, so public-site does not change. |
| D5 | Content model | Keep Strapi's `schema.json` format as WebX's content-model format, with the source of truth in a top-level `content-model/` folder; Strapi's copies are generated from it and CI fails if they differ; the Rust engine reads it directly; WordPress keeps its fixed post-type registry. |
| D6 | WordPress-native forms (Phase 7: polls, complaints, applications, breaking news in WordPress plugins) | Move the form inboxes to the control plane like Strapi's; breaking news is content and stays in WordPress. |
| D7 | Migrating existing tenants | Move bookkeeping and identity for `dga`, `pea`, `dgahub`, `orst`, `royalsociety` to the control plane while their content stays where it is; no tenant has to change engine. |
| D8 | First Rust tenant | A new test tenant on the `dgahub` template; then any customer that chooses the Rust setup. |
| D9 | Unknown or missing tenant (today every engine falls back to `dga`, see `engine-contract.md` section 2) | Make an explicit unknown key return an empty result and let only a request that names no tenant fall back, so a typo never serves another organisation's content. Needs the conformance suite (C1) first, because it changes Strapi's behaviour as well as the engine's. |

## Plan

Two tracks. The control-plane track comes first because it decides what an
engine has to do; the Rust track can start alongside it with C1 and R1–R2,
which do not depend on it.

### Track C: WebX control plane (about 7–10 weeks)

| # | Milestone | Effort |
|---|---|---|
| C1 | Engine conformance suite: one engine-neutral test set for the adapter interface (contract section 9.3 says it is still to be written), run against Strapi and WordPress | 3–4 days |
| C2 | `webx-control` service and store; tenant registry moved, with `/tenants/keys` and `/tenants/resolve` served by it; public-site reads tenants from it; build test identical | 6–8 days |
| C3 | Bookkeeping moved: the 13 `BOOKKEEPING_UIDS` types behind one control-plane interface in `governance.ts`; data migrated from Strapi; audit log written by the control plane only | 8–12 days |
| C4 | Identity: users, login, sessions, MFA, SSO and roles in the control plane; Studio logs in to WebX, not to an engine; engines get per-tenant service credentials with the acting editor passed along; e2e `user-management`, `mfa-enforcement` and `cross-tenant-isolation` pass for Strapi and WordPress tenants | 10–15 days |
| C5 | Runtime routes moved: captcha, rate limit, consent logs, search stats, forms with PII encryption, tenant contact, assistant (Node worker, D2); `PUBLIC_CMS_URL` points at the control plane for every engine | 10–15 days |
| C6 | Strapi and WordPress as pure content engines: their copies of the moved types and routes switched off; contract rewritten (D4); rebuild trigger from the control plane | 3–5 days |

### Track R: Rust engine as a full engine (about 4–6 weeks)

No users, login or runtime routes: the control plane provides those.

| # | Milestone | Effort |
|---|---|---|
| R1 (done 2026-11-23: `content-model/` with `sync.mjs check|write|adopt`, CI job `content-model`, the Rust exporter reads it; Studio still reads Strapi's content-manager) | `content-model/` as the source of truth (D5); Strapi's copies generated; CI check | 2 days |
| R2 (done 2026-11-23) | Store and database mode for reads: snapshot imported into the store; today's build test identical against the database mode | 5–7 days |
| R3 (done 2026-11-23 as engine write API, per-tenant tokens and adapter `rust.ts`, conformance 11/11; not yet done: unique slug rule, wiring `engine: "rust"` into governance and the tenant type, which wait for C2) | Content write API: entries, drafts and publish, locales, validation against the content model, unique slug per tenant and locale, tenant isolation, service-credential auth; Studio adapter `rust.ts`; `engine: "rust"` in the tenant type and in Studio's engine resolution | 8–12 days |
| R4 (done 2026-11-23: upload, library, edit, delete per tenant; image resizing and dimensions not yet) | Media: upload, the same resized formats and object shape as Strapi (`thumbnail`, `small`, `medium`, `large`), list, update, remove; local folder, S3-compatible later | 4–6 days |
| R5 | First Rust tenant (D8): Strapi-to-Rust content migration tool (drafts and media included); conformance suite (C1) and e2e `studio-roundtrip` pass for it | 4–6 days |

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
