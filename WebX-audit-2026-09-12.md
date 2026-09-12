## Fix status update (2026-09-12, later same day)

All 7 Criticals below are now **fixed and verified** (code review + `tsc --noEmit` on both `strapi-cms` and `webx-studio`, all 189 existing webx-studio unit tests still passing, a new live cross-tenant e2e test added and passing, and live manual verification via direct curl/Playwright against the running dev stack for every fix except C4 — WordPress wasn't running in this session, so that fix is code-reviewed and syntax-consistent but not live-executed). Diff touches 15 files; nothing has been committed yet.

**A genuinely new Critical-adjacent bug was found and fixed while writing C7's own regression test** (exactly the value that test was meant to provide): Strapi's tenant-scoping hook (`strapi-cms/src/index.ts`) correctly emptied the `data` field of a cross-tenant single-document read (`findOne` by documentId) for every SCOPED content type, but answered HTTP 200 instead of 403, and its separate `meta.availableLocales` computation bypassed the filter entirely, leaking a document's existence, timestamps, and a handful of non-text schema fields for any content type with `draftAndPublish: true`. Checked against every PII-bearing type (`complaint`/`application`/`contact-message`/`registration`) — none of them have `draftAndPublish` enabled, so no PII was ever exposed by this specific path; still fixed with an explicit ownership check that now throws a real 403 before Strapi's own findOne/meta logic ever runs, for every SCOPED type at once.

## Second fix pass (2026-09-12, High-severity, code-verifiable subset)

Continuing per the recommended order of work below. Picked off the High findings that were quick, well-defined, and verifiable without needing infrastructure unavailable in this session (Docker was still down, so H3/H8/H9/H10/H13 — the ones needing a live WordPress/Keycloak — are untouched this pass):

- **H1** (custom-role cross-tenant read) — Fixed and live-verified: `CUSTOM_ROLE_UID` added to `GENERIC_ROUTE_READ_BLOCKED_UIDS`; confirmed the dedicated `/api/cms/roles` page still works, and the generic route now 403s with "must be managed through its own screen."
- **H5** (Next.js CVE-2025-29927) — Fixed across all three Next.js apps (`webx-studio`, `public-site`, `marketing-site`), bumped 15.1.6 → 15.5.25 (latest stable 15.x, not just past the original CVE fix — 15.2.3 itself turned out to be deprecated for a *later* CVE, CVE-2025-66478). `tsc --noEmit` clean and `npm run build` succeeds on all three; all 189 webx-studio unit tests and the new e2e isolation suite still pass; live UI smoke test (login, dashboard, content browser) shows no regression. `npm audit fix` (non-breaking) additionally closed a `nanoid` advisory picked up incidentally; a `postcss` advisory remains, bundled inside Next itself and only fixable by a Next 16 major upgrade — left alone as out of scope for a targeted security patch, not a new issue introduced here.
- **H6** (LiteLLM no enforced auth) — Fixed: `docker-compose.yml`'s `LITELLM_MASTER_KEY` is now `:?`-guarded like every other secret in the file; `.env.production.example` updated to explain why. Not live-tested (Docker unavailable this session) but the change is a one-line `${VAR:-}` → `${VAR:?...}`, the same pattern already proven elsewhere in the same file.
- **H7** (admin ports open to 0.0.0.0) — Partially fixed: Strapi (1337) and LiteLLM (4000) now bind to `127.0.0.1` by default (confirmed via code review that both are reached only server-side over the internal docker network for the actual product workflow — a browser never needs either port directly). **Deliberately left WordPress (8081) and Keycloak (8082) unchanged** — unlike Strapi, real end-user browsers legitimately need to reach Keycloak directly for SSO redirect flows, and WordPress's wp-admin may be a legitimate direct-access surface for the content types explicitly routed to the classic editor (`custom-post-types.php`'s own Gutenberg-bug workaround) — binding those to loopback without being able to live-verify the actual required access pattern risked breaking a real feature. Flagging this as a decision, not an oversight: it needs a live WordPress+Keycloak environment to resolve properly (likely via a reverse-proxy path-based routing design, not a blind loopback bind).
- **H11** (strapi-cms Docker image runs as root) — Fixed: `strapi-cms/Dockerfile` now runs as the base `node:20-slim` image's built-in non-root `node` user, same pattern already proven in `webx-studio/Dockerfile`. **Not live-verified** — Docker wasn't available this session to actually build and run the image; the risk is low (well-established pattern, `--chown` on the final `COPY` to keep `public/uploads` writable) but this should get a real `docker build` + boot check before being trusted in production.

## Third fix pass (2026-09-12, H2/H3 — the stored-XSS gap)

- **H2** (no HTML sanitizer anywhere) — Fixed across both apps, at every one of the 13 real injection call sites the earlier audit identified (rich-text bodies, accordion/tab item bodies, custom-block-template interpolation output), plus the WYSIWYG editor's own load path (`webx-studio/components/RichText.tsx`, which sets `el.innerHTML` directly and was exposed to the identical `onerror=`/`onload=`-style attribute-based vector even though browsers don't execute a bare `<script>` inserted that way). Two new small library-based sanitizers, not a homegrown one: `public-site/lib/sanitize.ts` (`sanitize-html`, since every call site there renders at build time in Node) and `webx-studio/lib/sanitize.ts` (`dompurify`, since every call site there is a client component running in the browser). Also fixed, found adjacent to this work: `FaqBlock.tsx`/`Faqs.tsx` (both apps) built JSON-LD via bare `JSON.stringify()`, which doesn't escape `<` — a CMS-authored string containing a literal `</script>` could break out of the JSON-LD `<script>` tag; added a `jsonForScript()` helper next to each sanitizer.
  - **Real bugs caught by actually testing the fix, not just writing it**: (1) the first allowlist let `style="background:url(javascript:...)"` straight through — sanitize-html/DOMPurify only validate attribute *names* by default, not values — closed with an explicit value-pattern check on `style` in both sanitizers. (2) `webx-studio`'s DOMPurify-based sanitizer crashed `/builder` with a 500 (`addHook is not a function`) the first time it ran for real — Next.js still server-renders "use client" components once during SSR, and DOMPurify's Node-resolved export isn't the same ready-to-use instance the browser gets. Fixed by lazily constructing the DOMPurify instance only when `window` exists, returning `""` server-side (these are authenticated admin-only Builder/preview routes, never public/SEO'd, so a blank first server-paint before client hydration has no real cost).
  - Verified: a payload set (`<script>`, `onerror=`, `javascript:` href, `onload=` on svg, the CSS `url(javascript:)` case, `<iframe>`, `onclick=`) run through both sanitizers directly (via `tsx` + `jsdom` for the browser-only DOMPurify path) confirms every vector is stripped while ordinary formatted content (bold, links) survives intact. `tsc --noEmit` clean, `next build` succeeds on both apps (bundle size increase confirms the library actually bundled, not silently no-op'd), all 189 webx-studio unit tests and the e2e isolation suite (6/6) still pass, and a live browser check of `/builder` (a fresh tab, not a cached one) shows no console errors and normal rendering after the SSR-crash fix.
- **H3** (`EmbedBlock`'s zero local defense-in-depth) — **Deliberately not touched this pass.** A proper fix needs the tenant's current plan/`embedCode` custom-role permission plumbed down to a component that today only receives the raw block data, and getting that wrong (either an incomplete check that doesn't actually add protection, or a bug that blocks legitimate embedded content) seemed worse than leaving the existing single-layer, server-side-only enforcement (already real, already tested) in place until it can be designed properly. Flagging as an explicit decision, not an oversight — see the report's existing H3 entry above for what a real fix would need.

Per-finding status (original 7 Criticals):
- **C1** (ai/search + ai/index tenant trust) — Fixed, live-verified (auth/tenant-resolution gate confirmed to run and correctly override the caller's tenant; full end-to-end data-isolation proof blocked only by LiteLLM not running in this dev environment, unrelated to the fix itself).
- **C2** (console export) — Fixed, live-verified (cross-tenant `?tenant=` request now silently resolves to the caller's own tenant instead of the requested one; super-admin explicit/all-tenant/unknown-tenant paths all still behave correctly).
- **C3** (block-type/icon/release/review missing from SCOPED) — Fixed at both layers (`strapi-cms/src/index.ts` and `webx-studio/lib/cms/governance.ts`'s own separate SCOPED set), live-verified via the new e2e suite.
- **C4** (WordPress governed-type maps) — Fixed in code, not live-verified (WordPress container wasn't running this session).
- **C5** (MCP/CLI publish bypass) — Fixed, functionally verified with a mocked-fetch unit check confirming `publishedAt`/`status` are stripped from Strapi payloads and WordPress creates are forced to `draft` regardless of caller input.
- **C6** (hardcoded admin passwords) — Fixed (env-var override added, matching `seedScheduler`'s existing pattern; `docker-compose.yml` and `.env.production.example` updated to require it in production).
- **C7** (no cross-tenant isolation test) — Fixed: `e2e/tests/cross-tenant-isolation.spec.ts` added and passing (6/6), covering both a content type that was always scoped and one that was found missing from scoping in this same audit.

# WebX — Full Codebase Audit

**Date:** 2026-09-12 · **Method:** 6 parallel deep-read audits (not grep-only — each agent read the actual source of its slice in full or near-full), covering architecture, code quality, and security. ~530K tokens of analysis across ~345 tool calls. Every finding below is grounded in a specific file/line the auditing agent actually read; nothing here is generic checklist advice.

**Scope covered:**
1. `webx-studio/lib/**` + `middleware.ts` (business logic, agent engine, LLM abstraction)
2. `webx-studio/app/**` + `components/**` (routes, UI)
3. `strapi-cms/src/**` (backend, all content types, middlewares, utils)
4. `public-site/**` + `marketing-site/**` (citizen-facing rendering)
5. `wordpress/mu-plugins/**` + `cli-webx/` + `mcp-webx/` + `shared/` (alt engine + tooling)
6. Cross-cutting: `docs/`, `DEPLOY.md`, `docker-compose*.yml`, `.github/**`, `e2e/`, `eval/`, dependency manifests

Not covered in depth: `site/` (legacy static DGA demo), `litellm/` beyond its config, `wordpress/blocks/src` beyond a skim.

---

## The one-sentence version

**Tenant isolation and permission enforcement is implemented as a hand-maintained allowlist in at least five independent places (Strapi's `SCOPED` set, webx-studio's `governance.ts` scoping branches, WordPress's `custom-role-enforcement.php` governed-type maps, the seed script's permission-bootstrap functions, and the MCP/CLI tools' "no publish/delete" promise) — and every single one of them has already drifted out of sync with reality at least once, with three of those five currently exploitable today.** This is the dominant fix priority: not any one bug, but the pattern that keeps producing this exact bug shape.

---

## Critical (fix before anything else — real, exploitable data exposure or credential issues)

### C1. Cross-tenant vector-search leak/poisoning — `webx-studio/app/api/ai/search/route.ts:9-16`, `app/api/ai/index/route.ts:16-45`
Both routes take `tenant` straight from the request body and hand it to `lib/vectorstore.ts`, which queries/tags the `api::doc-embedding.doc-embedding` Strapi collection using the caller's own token — completely outside `governance.ts`. `doc-embedding` is **not** in Strapi's `SCOPED` set (`strapi-cms/src/index.ts:14-36`), so the tenant-scoping middleware never runs for it either. Any authenticated editor of tenant A can `POST /api/ai/search {"tenant":"tenant-b"}` and read tenant B's indexed content, or `POST /api/ai/index {"tenant":"tenant-b"}` to poison tenant B's search index with tenant A's content.
**Fix:** derive tenant server-side from the caller's real session (same as every `/api/cms/**` route), never trust the body; add `doc-embedding` to Strapi's `SCOPED` set as a backstop.

### C2. Cross-tenant PII export — `strapi-cms/src/api/console/controllers/console.ts:104-106`, route `GET /api/console/export`
`exportData` is the one action in this controller that resolves tenant from `ctx.state.tenantId` (set by the public, client-suppliable `?tenant=`/`X-Tenant`/Host middleware) instead of the admin's own `adminEmails` membership like every sibling action (`context`, `updateBranding`, `users`) correctly does. Guarded only by "any active Strapi admin," not "admin of this tenant." Any tenant-A editor can call `GET /api/console/export?type=complaint&tenant=<tenant-B>` and download tenant B's complaints/applications/registrations (name/email/phone) as an Excel file.
**Fix:** resolve tenant via `adminTenantFor`/`adminEmails` like the other three actions in the same file; honor `?tenant=` only for confirmed super admins.

### C3. `block-type` and `icon` excluded from tenant scoping but granted full CRUD — `strapi-cms/src/index.ts:14-36` + `seed.ts:734-767,782-800`
Four content types carry a `tenant` relation (`block-type`, `icon`, `release`, `review`) but are absent from the `SCOPED` allowlist, so the Document Service middleware `return next()`s immediately with no tenant filter, no create-time stamp, no ownership check. Editor/Author roles already hold full content-manager CRUD on `block-type` and `icon` — so any tenant-A editor can list/read/update/delete/publish tenant-B's custom Visual-Builder block definitions and icon library via the ordinary REST API, no special tooling needed. (`release`/`review` share the schema gap but aren't currently granted to non-super-admin roles — latent, not yet exploitable.)
**Fix:** add all four UIDs to `SCOPED`. Root cause: `SCOPED` is a hand-enumerated set, not derived from "has a `tenant` relation" — fix the generator, not just the four instances (see A1 below).

### C4. WordPress: 6 post types missing from tenant/permission enforcement — `wordpress/mu-plugins/custom-role-enforcement.php:41-68`
`complaint`, `application`, `contact_message`, `poll`, `job`, `breaking_news` (all registered in `public-forms-post-types.php`) are absent from both the REST cross-tenant write filter and the wp-admin read-scoping filter. Combined with none of these CPTs setting a custom `capability_type`, **any WordPress user with ordinary `edit_others_posts`** (any Editor/Administrator, regardless of which tenant they were provisioned for) can read and write every tenant's complaints, contact messages, and job applications (PII-bearing), and — most visibly — publish a `breaking_news` alert onto a tenant they don't own. This is a live defacement/misinformation vector on a government site.
**Fix:** add these six post types to both governed maps in `custom-role-enforcement.php` immediately. Root cause: four independent hand-maintained lists (post type registration, ACF fields, REST routes, governed-type maps) with nothing enforcing they stay in sync — see A2.

### C5. MCP/CLI "agents cannot publish or delete" is not actually enforced — `shared/cms-client.mjs:144-150` + `mcp-webx/server.mjs`
WordPress's `create()` builds the body as `{status: "draft", ...data}` — since `data` is spread *after* the default, a caller passing `data.status = "publish"` overrides it, publishing immediately via `create_entry`. `update()` forwards `data` completely unfiltered, so `update_entry({data:{status:"publish"}})` flips a post live with zero gate. The equivalent Strapi path lets a caller set `publishedAt` directly, the exact field Strapi's own publish action manipulates. The MCP tool description explicitly promises this can't happen — it's false for both engines today.
**Fix:** strip/reject `status`/`publishedAt` (and any other lifecycle field) server-side inside `cms-client.mjs`'s `create`/`update`, not just by omission from the tool description; back it with a second layer (a WP role without `publish_posts` for the credential these tools use).

### C6. Hardcoded, unoverridable admin passwords seeded on every boot, including production — `strapi-cms/src/seed/seed.ts:809-826`
```js
{ email: "dga-editor@dga.local", password: "DgaEd@2569" }
{ email: "pea-editor@pea.local", password: "PeaEd@2569" }
```
`seedEditors()` runs unconditionally from `bootstrap()`, with **no env-var override at all** — unlike the scheduler account seeded right below it, whose own comment explicitly warns "this repo is public" and requires an env override, enforced by `docker-compose.yml`'s `:?set STRAPI_SCHEDULER_PASSWORD`. These two Editor accounts get no such guard: they're idempotently recreated with the same fixed, public password on every fresh deploy.
**Fix:** gate `seedEditors` behind an explicit dev/demo flag, or require env-supplied passwords with no hardcoded fallback, matching `seedScheduler`'s pattern exactly.

### C7. No automated test anywhere exercises multi-tenant isolation
Confirmed by exhaustive search across `webx-studio/tests/**` and `e2e/tests/**`: zero hits for cross-tenant/isolation checks. The Strapi Document Service middleware (`strapi-cms/src/index.ts:159-204`) — the single most security-critical control in the entire system — has no test file, and `strapi-cms/package.json` has no test script at all. Every one of C1, C3, and C4 above is exactly the kind of regression this would have caught.
**Fix:** at minimum, one e2e test per engine that logs in as tenant A's editor and attempts to read/update/publish a tenant-B document directly by ID, asserting rejection. This is the single highest-value test to add anywhere in this codebase.

---

## High

### H1. Custom roles readable cross-tenant — `webx-studio/lib/cms/governance.ts:213-274`
`CUSTOM_ROLE_UID` has no branch in `governed.list`/`governed.get`'s per-uid scoping and isn't in `GENERIC_ROUTE_READ_BLOCKED_UIDS`. The code's own comment acknowledges this is a known, still-open gap. Any authenticated user of any tenant can read every other workspace's custom-role names and permission matrices via the generic entries route.
**Fix:** add `CUSTOM_ROLE_UID` to `GENERIC_ROUTE_READ_BLOCKED_UIDS` (its dedicated `getCustomRoles()` path is the intended reader).

### H2. Stored XSS — no HTML sanitizer anywhere in the rendering chain
Confirmed absent (no DOMPurify/sanitize-html/xss dependency) in both `public-site` and `webx-studio`. Every rich-text/custom-block field flows through `dangerouslySetInnerHTML` unsanitized:
- `public-site`: `components/blocks/BlockRenderer.tsx:100,491`, `CollectionPageRenderer.tsx:50`, `TabsAccordionBlock.tsx:30,52`, both tenant template trees
- `webx-studio`: `components/blockPreview/blocks.tsx:123,420,435,636`, `VisualBuilder.tsx:1012,1040`, `RichText.tsx:17`

For public-site this is citizen-facing (any compromised editor account or over-permissioned custom role → site-wide XSS on a live government site, no second layer of defense). For webx-studio, injected script runs same-origin as whoever opens the Visual Builder preview/review — a real privilege-escalation path (can drive authenticated `fetch()` to mint an API token or reassign a role), not just cosmetic.
**Fix:** one sanitizer (e.g. `sanitize-html` with a strict allowlist) applied once at the data-fetching layer (`lib/cms.ts` on public-site; wherever block content is loaded in webx-studio) rather than trusted ad hoc at every render call site.

### H3. `EmbedBlock` executes tenant-authored `<script>` with zero defense-in-depth — `public-site/components/blocks/EmbedBlock.tsx:19-25`
Deliberately re-creates `<script>` tags from CMS-supplied HTML so they execute. The component's own comment says enforcement is "gated server-side by governance.ts's `embedCode` permission, not by anything here" — i.e. 100% of the control lives in a different repo slice, with no local check (allowlist, tenant/plan flag) as a backstop.
**Fix:** add a defense-in-depth check here (fetch and verify a tenant/plan flag alongside the block data) so a bug in webx-studio's gate doesn't equal arbitrary script execution on the live site.

### H4. `complaint`/`application` store PII as plaintext — `strapi-cms/src/api/{complaint,application}/content-types/*/lifecycles.ts`
Both schemas have `name`/`email`/`phone`. Unlike `contact-message`/`registration` (built to the same documented PDPA "encryption at rest" pattern), neither lifecycle calls `encryptFields`/`decryptFields`. `complaint` can carry whistleblower content ("แจ้งเบาะแส"), making this especially sensitive.
**Fix:** apply the same encrypt/decrypt lifecycle hooks used by `contact-message`/`registration` — ideally via a shared `withPiiEncryption(uid, fields)` factory (this duplication is also *why* it was missed, see M-group below).

### H5. Next.js pinned to a version with a known middleware auth-bypass CVE — `webx-studio/package.json` (`next: 15.1.6`)
CVE-2025-29927 (patched 15.2.3) allows bypassing middleware via `x-middleware-subrequest`. `webx-studio/middleware.ts` is exactly the pattern this targets (session-cookie gate + the only rate limiting on `/api/auth/*`). Impact is partially mitigated — most routes independently call `requireUser()` which re-validates against Strapi — but the login rate limiter and any route that *doesn't* re-validate would be exposed.
**Fix:** bump to Next.js ≥15.2.3 — a patch-version bump, not a migration.

### H6. LiteLLM AI gateway has no enforced authentication by default
`litellm/config.yaml:38` reads `master_key` from an env var that's blank by default; `.env.production.example` doesn't flag `LITELLM_MASTER_KEY` as required, and `docker-compose.yml` doesn't `:?`-guard it (unlike DB password and Strapi's 5 secrets). LiteLLM treats an unset master key as "no auth required." An operator following DEPLOY.md's own Docker Compose path can end up with the gateway holding `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY` reachable with zero auth on port 4000.
**Fix:** make `LITELLM_MASTER_KEY` a hard-required var whenever the `ai` compose profile is used; call it out explicitly in DEPLOY.md's production checklist.

### H7. Admin-plane ports exposed to `0.0.0.0` by default, TLS is an unchecked checklist item
`docker-compose.yml` publishes Strapi (1337), Keycloak (8082), WordPress (8081), and LiteLLM (4000) to all interfaces with no documented recommendation to bind to loopback or firewall them, while "HTTPS/TLS terminated in front" in DEPLOY.md's checklist is an easy-to-skip `[ ]` box. A first-class documented use case (DGA on-prem, `docker compose up -d` on a routable host) has a real window where admin logins are reachable in plaintext over the open internet.
**Fix:** bind these to `127.0.0.1:PORT:CONTAINER_PORT` by default, forcing an explicit override for direct exposure, or make the TLS step loud and blocking rather than an unchecked box.

### H8. WordPress public forms: trivial captcha + zero rate limiting — `wordpress/mu-plugins/public-forms-api.php:32-49`
The captcha is single-digit addition (answer range 2–18) with no rate limiting anywhere on `/webx/v1/captcha`, `/complaints`, `/contact-messages`, or `/applications`. Combined with `wp_mail()` sent to the attacker-supplied `email` field on submission, this is directly scriptable to flood the content tables and email-bomb an arbitrary third party using the "we received your complaint" confirmation email.
**Fix:** add IP/transient-based rate limiting per endpoint (WordPress has no built-in primitive, but the existing captcha transient mechanism can be reused to track per-IP submission counts).

### H9. Demo MFA on Strapi's native admin discloses its own shared secret and doesn't cover the real login path — `strapi-cms/src/api/security/controllers/security.ts:27`, `middlewares/admin-mfa.ts:8-11`
The MFA page renders the shared `MFA_SECRET` directly into the pre-auth HTML it serves — anyone who loads that page once can compute valid codes indefinitely. Separately, this gate only covers `GET`+`text/html` navigation to `/admin*`; it never sits in front of `/admin/login` (JSON POST) or any REST/content-manager route. An attacker with valid credentials or a stolen session token never needs to satisfy it.
**Fix:** if this is meant as real protection rather than a demo gate, cover `/admin/login` itself and stop rendering the secret in-page.

### H10. SSRF via tenant-controlled SSO issuer URL — `webx-studio/lib/cms/governance.ts:572-582` + `lib/oidc.ts:13-19`
`saveTenantSsoConfig` validates `issuerUrl` only with `new URL(...)` — no scheme/host allowlist, no private-IP/loopback/link-local blocking — before it's fed into a server-side `discover()` fetch. A workspace admin (a real, low-privilege actor in a self-serve SaaS) can point this at an internal service.
**Fix:** resolve the host and reject RFC1918/loopback/link-local ranges before calling `discover()`, or restrict to an operator-curated IdP allowlist.

### H11. `strapi-cms`'s Docker image runs as root
`webx-studio/Dockerfile` explicitly creates and switches to a non-root user; `strapi-cms/Dockerfile` has no `USER` directive at all — on the image holding DB credentials, the PII encryption key, and the admin JWT secret. DEPLOY.md's own production checklist names the exact verification command (`docker inspect --format '{{.Config.User}}'`) that would fail against this image.
**Fix:** add the same non-root `USER` stanza already proven in `webx-studio/Dockerfile`.

### H12. CI doesn't run what the docs say it runs
`.github/workflows/ci.yml` runs `tsc`+unit tests+build for `webx-studio`/`strapi-cms`, `tsc` only for `public-site` — but `eval/README.md` and `docs/TECHNICAL.md` both call the Thai retrieval eval "a CI quality gate," and it's never invoked in CI. The 1,342-line Playwright e2e suite (MFA enforcement, real-backend agent run, user management) never runs in CI either — manual-only. There's also no lint step (ESLint/`next lint`) anywhere. `marketing-site` and `wordpress/blocks` aren't built/checked in CI at all.
**Fix:** either wire e2e + eval into CI, or stop calling them CI gates in the docs. Add a lint step.

### H13. WordPress tenant enforcement only covers the REST API path
`custom-role-enforcement.php`'s single hook (`rest_request_before_callbacks`) doesn't cover classic-editor form submission, Quick Edit/bulk edit, or WP-CLI — all of which call `wp_insert_post()`/`wp_update_post()` directly. This is concretely reachable: `custom-post-types.php:169-172` explicitly routes `org-unit`, `mission-item`, `timeline-event`, and `document` to the classic editor to work around a Gutenberg bug, and saves for those types bypass cross-tenant enforcement entirely.
**Fix:** also hook `save_post` (fires for every insert/update path) with the same tenant/permission logic as a backstop.

### H14. Silent, mislabeled fallback on Strapi outage at build time — `public-site/lib/cms.ts:73-87`, `components/HomePage.tsx:21,39`
On a Strapi outage during a scheduled static-export build, `listTenants()` silently falls back to a hardcoded 2-tenant list and `getTenant()`-failures get backfilled with a hardcoded **DGA-branded** fallback — and the build still exits 0. A transient hiccup during a rebuild can silently drop a non-dga/pea tenant's pages from the export, or render a real agency's site mislabeled as DGA, with the deploy pipeline reporting success throughout.
**Fix:** fail the build loudly (non-zero exit) when tenant data can't be fetched, rather than degrading silently.

---

## Fourth fix pass (2026-09-12, the Medium list)

11 of 19 Medium findings fixed and verified; 8 deliberately deferred with reasoning. Table below is updated in place — status noted per row.

- **M2 — fixed, live-verified**: added a boot-time diagnostic (`warnIfTenantRelationMissingFromScoped` in `strapi-cms/src/index.ts`) that scans every `api::*` content type for a `tenant` relation not in `SCOPED` and logs a loud warning if it finds one — the exact backstop that would have caught C3 before it shipped. Verified both ways: temporarily removed `block-type` from `SCOPED` and confirmed the warning fired naming exactly that type, then restored it and confirmed silence.
- **M3 — fixed, live-verified, and corrected**: the original finding (14 content types missing from every permission-bootstrap function) was based on static schema/code cross-referencing. Checked empirically against this project's actual running database instead of trusting that analysis: **only `breaking-news` actually has zero Editor/Author permissions** — the other 13 already have full CRUD, presumably added early enough to catch Strapi's one-time default-role sync. Added `ensureBreakingNewsPermissions()` (Editor: full CRUD+publish, Author: CRUD, matching the existing role-split convention); confirmed live it grants exactly 5+4 permissions on first boot and zero on the next (idempotent).
- **M4 — fixed**: `governance.ts` now logs a loud `console.error` at import time if `STRAPI_INTERNAL_SECRET` is empty in production — the cross-tenant write guard silently disabling itself now has a signal.
- **M5 — fixed**: `genPassword.ts` switched from `Math.random()` to `crypto.randomInt` throughout.
- **M8 — fixed, both mirrored implementations**: `resolveCustomRolePermissions` (webx-studio) and `resolveCustomRolePerms` (strapi-cms) now return a fully-restricted permission object instead of `null` when an assigned custom role no longer exists — deleting a restrictive role now denies access until reassigned, instead of silently expanding it back to the user's native admin role.
- **M9 — fixed**: `MFA_SECRET`/`MFA_COOKIE_SECRET`/`MFA_ENABLED` were never wired through `docker-compose.yml` at all — a value in `.env` was silently ignored and the hardcoded fallback always applied in every deployment. Now passed through (optional, not required — this is a documented demo/soft gate, not real protection; see H9).
- **M10 — fixed**: `/api/internal/tenant-of` now validates its `uid` query param against the same `SCOPED` set (now exported from `src/index.ts`) before querying, closing the "existence/ownership oracle for any model" gap.
- **M11 — fixed**: `traffic-log.ts` now reads `ctx.request.ip` (same as `rate-limit.ts` already did) instead of parsing `X-Forwarded-For` itself unconditionally. Added a new `TRUST_PROXY` env var (`config/server.ts`'s `proxy` option) so `X-Forwarded-For` is only trusted at all when an operator explicitly confirms a real reverse proxy sits in front — off by default.
- **M12 — fixed**: SSO callback's open redirect closed — rejects `next` values starting with `//` and confirms the resolved URL is same-origin before trusting it.
- **M17 — fixed in code, not live-tested** (no WordPress running this session): the poll-vote read-modify-write race now holds a MySQL named lock (`GET_LOCK`/`RELEASE_LOCK`, scoped per poll id) around the read-modify-write, closing the lost-update window without touching ACF's own storage format.
- **M19 — fixed**: `PGVECTOR_URL`'s example is now genuinely blank instead of a real-looking connection string.
- **M15 — attempted, deferred**: writing a real unit test for seat-limit enforcement needs `governed.auth.create` to run outside the acting-job bypass path, which means mocking a real interactive session — every existing test either uses the acting-session bypass (no session needed) or tests pure extracted functions. `requireUser()` calls Next's `cookies()`, which throws when called outside an actual request scope, so this needs either a session-mocking harness this test suite doesn't have yet or a dependency-injection refactor of `requireUser()` itself. Judged as more test-infrastructure risk than the finding's severity warrants for this pass — left as a known gap rather than shipping something fragile.

**Deferred, not attempted** — architecture/infra decisions or need a live environment this session didn't have, not quick code fixes:
- **M1** (governance.ts god-file) — a real structural refactor of the highest-blast-radius file in the codebase; doing it safely needs the M15-class test coverage this file doesn't have yet, not a same-session drive-by.
- **M6/M7** (multi-replica cache/rate-limit staleness) — both need a shared store (Redis, or equivalent) across instances; that's an infrastructure decision for whoever runs a multi-replica deployment, not a code change to make unilaterally.
- **M13** (cross-service secret-mismatch detection) — a new health-check feature, not a bug fix; reasonable future work, out of scope for a fix pass.
- **M14** (LiteLLM's floating `:main-latest` tag) — tried to resolve a real pinned release tag via the registry and couldn't verify one with confidence; pinning to a guessed/wrong tag risks completely breaking the AI gateway for every self-hosted operator, worse than the current floating-tag risk. Needs a maintainer to confirm the right tag from LiteLLM's own release notes.
- **M16/M18** (WordPress: 4 hand-maintained public-forms lists; duplicated blocks-field-permission check) — both are refactors of live plugin registration/enforcement code; comfortable fixing a small, self-contained bug there without live-testing (M17, and C4 earlier), less comfortable restructuring how content types get registered or where a permission check lives without a real WordPress instance to confirm nothing broke.

Verified across this whole pass: `tsc --noEmit` clean on both `strapi-cms` and `webx-studio`, all 189 webx-studio unit tests and the cross-tenant-isolation e2e suite (6/6) still pass after every restart.

## Medium

| # | Finding | Location |
|---|---|---|
| M1 | `governance.ts` is a 3,118-line god-file owning tenant resolution, signup, MFA, SSO, RBAC, field policy, agent policy/jobs/schedules/threads, and billing — all sharing module-level mutable caches. Highest blast-radius file in the codebase. | `webx-studio/lib/cms/governance.ts` |
| M2 | Two independent, hand-synchronized tenant-scoping systems (Strapi's Document Service hook + governance.ts) — the code's own comments catalog **six** historically-found cross-tenant leaks that all trace to a uid added to one system without a matching branch in the other. This is the same root pattern as C3/C4. | `governance.ts` header comment + `strapi-cms/src/index.ts` |
| M3 | 14 more Strapi content types with `draftAndPublish: true` (`blog, breaking-news, catalog, download, ebook, event, gallery, location, menu-item, poll, popup, sitemap-node, top-graphic, weblink`) are absent from every `ensure*Permissions` bootstrap function — same bug class as two already-patched historical gaps, just not yet hit by manual testing. | `strapi-cms/src/seed/seed.ts` |
| M4 | Cross-tenant write guard (`tenantGuard`/`trueOwnerOf`) fails open with zero alerting if `STRAPI_INTERNAL_SECRET` is unset — the dedicated guard silently disables itself. | `governance.ts:1329-1369` |
| M5 | Temp/admin passwords generated with `Math.random()`, not a CSPRNG — including the password behind every SSO JIT-provisioned shadow Strapi admin account. Contrast: `totp.ts`'s recovery codes correctly use `crypto.randomInt` in the same codebase. | `webx-studio/lib/cms/genPassword.ts:13-26` |
| M6 | MFA brute-force limiter is an in-memory per-process `Map` with no documented multi-replica caveat (unlike the general rate limiter, which has one) — a distributed attacker gets N× the intended attempt budget in any multi-instance deployment. | `governance.ts:1142-1162` |
| M7 | Security-relevant caches (tenant, custom-role, field-policy) invalidate only in the writing process — a change on one instance (disable SSO, revoke a role, lower agent autonomy) is invisible to other instances for up to 30s in a multi-replica deployment. | `governance.ts:304-323,881-899,1293-1309` |
| M8 | Custom-role enforcement in Strapi fails **open** when the assigned role is deleted — deleting a restrictive custom role (a natural "revoke access" action) instead expands the user back to their broader underlying admin role. | `strapi-cms/src/utils/custom-role.ts:40` |
| M9 | Hardcoded fallback secrets: `MFA_SECRET` defaults to the literal Wikipedia-example TOTP secret `JBSWY3DPEHPK3PXP`; `COOKIE_SECRET` falls back to a hardcoded string. Neither has the `:?`-enforcement pattern used for the scheduler password. | `strapi-cms/src/utils/mfa.ts:5-6` |
| M10 | `/api/internal/tenant-of` accepts an arbitrary content-type `uid` from the query string, turning a narrow ownership lookup into a general existence/ownership oracle for any model (protected by the internal secret, so not directly attacker-reachable, but under-scoped). | `strapi-cms/src/api/internal/controllers/internal.ts:27-32` |
| M11 | Legally-mandated traffic log (พ.ร.บ.คอมพิวเตอร์ retention) trusts a client-supplied `X-Forwarded-For` with no trusted-proxy config, so any external client can forge the recorded source IP. | `strapi-cms/src/middlewares/traffic-log.ts:50-51` |
| M12 | Open redirect in SSO callback: `next=//evil.com` passes the `startsWith("/")` check but resolves to an external origin via `new URL(dest, req.url)`. | `webx-studio/app/api/auth/sso/callback/route.ts:41` |
| M13 | Config (internal secrets, scheduler password) is duplicated across 2-3 services by design with no boot-time check that the copies actually match — a hand-edit mismatch fails as opaque 403s with no diagnostic. | `docker-compose.yml` |
| M14 | LiteLLM's own image is pinned to the floating `:main-latest` tag — the exact anti-pattern the team documented and fixed for the WordPress image (`wordpress/Dockerfile` has a paragraph on why), reintroduced here. | `docker-compose.yml:347` |
| M15 | No test confirms plan/seat-limit enforcement actually blocks adding a user past a workspace's cap (the agent's own token-budget enforcement is well-tested; this sibling isn't). | — |
| M16 | Public-forms content types are defined via four independent hand-maintained lists (post type registration, ACF fields, REST routes, governed-type maps) with nothing enforcing they stay in sync — this is the direct root cause of C4. | `wordpress/mu-plugins/public-forms-*.php` |
| M17 | Poll-vote read-modify-write has no locking — concurrent votes can lose updates (classic lost-update). Low real-world impact today, but the pattern would be worse if reused where integrity matters more. | `wordpress/mu-plugins/public-forms-api.php:206-227` |
| M18 | Same "is `blocks` field forbidden for this user" permission check is independently re-implemented in two separate places (`custom-role-enforcement.php` and `webx-blocks-sync.php`) — a third write path (the WP-CLI backfill command) has no check at all, by design since it's operator-run, but would need to remember this a third time if ever exposed further. | `wordpress/mu-plugins/*.php` |
| M19 | `PGVECTOR_URL`'s example value in `.env.production.example` is a plausible-looking real connection string (`postgres://strapi:CHANGE_ME@db:5432/strapi`) rather than an obviously-fake placeholder — easy to copy verbatim without noticing it needs changing. | `.env.production.example:174` |

---

## Low / code quality (grouped — punch-list style, not individually templated)

**Confirmed real bugs, minor severity:**
- Nested `<button>` inside `<button>` in the agent thread list — invalid HTML5, causes a React hydration warning, real (if minor) a11y problem. `webx-studio/components/agent/AgentWorkspace.tsx:71-75` (`ThreadList`).
- Custom-block template interpolation escapes text-typed values but not `richtext`/`image`-typed ones regardless of the surrounding HTML context (could break out of an attribute) — `public-site/components/blocks/BlockRenderer.tsx:37-46`.
- Internal-secret comparisons across `webx-studio/app/api/internal/**` use plain `!==`, not constant-time comparison (minor timing side-channel on a long-lived shared secret).
- CSRF relies solely on `sameSite=lax` with no explicit token — currently adequate (JSON-only POST bodies can't be forged from a plain HTML form) but a single point of failure if any route ever accepts form-encoded bodies.

**Architecture smells:**
- `VisualBuilder.tsx` is a single ~1,880-line component carrying 50 of the codebase's `any`-typed usages (by far the most of any file) — exactly the part of the app shaping tenant-controlled content structures that feeds into H2's XSS risk.
- `/api/ai/*` routes hand-roll their own auth/error-handling instead of going through the `handle()`/`governed.*` pattern every `/api/cms/**` route uses — architecturally inconsistent, and the direct cause of C1.
- Two independent public-facing Next.js template trees (`public-site/templates/orst/*` vs `royalsociety/*`) are near-complete copy-paste of each other (1263 vs 1149 lines), already visibly drifted (one shares an icon component, the other doesn't).
- `public-site/lib/cms.ts` does at least four jobs (Strapi client, WordPress client, RSS/ICS param enumeration, locale fallback) in one ~550-line file.
- Adapter/uid-routing logic in webx-studio spread across three overlapping functions (`activeAdapter`, `adapterFor`, `withContentAdapter`) with a hand-duplicated `PAGE_LIKE_UIDS`/`PAGE_UIDS` pair.
- `AgentLevel` rank ordering duplicated in two files with nothing pinning them together.
- Triplicated tenant-fallback-resolution logic in Strapi (`middlewares/tenant.ts`, `middlewares/seo.ts`, `api/tenant/controllers/tenant.ts`) — one edit away from silent divergence.
- Duplicated PII encrypt/decrypt lifecycle boilerplate between `contact-message`/`registration` (this duplication is *why* `complaint`/`application` in H4 were missed).
- Duplicated full-text-extraction lifecycle between `download`/`ebook` (byte-identical except a UID string).
- `seed.ts` has grown to ~900 unstructured lines mixing locale setup, content seeding, and seven independent one-off permission patches — the direct cause of M3's 14 uncovered content types.
- Duplicated `fmt`/`fmtTime` date-formatting helpers redefined independently in 6+ webx-studio components despite a reusable version already existing in one of them.
- i18n handled two different ways in webx-studio — most text through a central dictionary, but several components hardcode bilingual literals inline instead.
- Fail-open error handling re-implemented ad hoc at 6+ call sites in `governance.ts` with no single named helper.
- No dedicated test file for `governance.ts` despite it being the file whose own comments document the most historically-found security bugs in the codebase.
- Stale in-code comment in `governance.ts` claims a gap exists in 3 places when only 1 (custom-role, see H1) is actually still open — risks misleading a future maintainer.
- Deprecated `document.execCommand` powers the rich-text toolbar (feeds into H2).
- Dead entries in WordPress's CAPTCHA-guard route allowlist referencing routes that no longer exist.
- `cms-client.mjs` doesn't `encodeURIComponent` the content-type name in REST paths (low risk — trusted operator/agent credentials, not public input) and leaks up to 240 chars of raw upstream error bodies into thrown errors.
- No lint step, no visible release/versioning process, GitHub Actions pinned to mutable major-version tags (low risk here specifically, no secrets in scope).

---

## Strengths (worth propagating elsewhere — genuinely good patterns found)

1. **Structural, defense-in-depth agent tool permission model** (`webx-studio/lib/agent/tools.ts`) — tool availability is gated by autonomy level at both offer-time and execution-time, with publish/delete/role/token actions actively denied by a regex checked at both points. A "READ ONLY" level cannot reach a write structurally, not by convention. This is exactly the guarantee C3/C4/C5 above are each missing in their own subsystem — worth using as the template for fixing them.
2. **Background job owner re-verification** (`lib/agent/jobs/owner.ts`) — re-resolves the owner's live tenant/policy before every job slice, taking the most-restrictive merge; a departed or demoted owner is caught before the next slice runs.
3. **Consistent untrusted-content wrapping for the LLM** (`lib/agent/prompts.ts`) — every piece of stored CMS content handed to the model is explicitly delimited and labeled as data, not instructions — a real, consistently-applied prompt-injection mitigation.
4. **`pii-crypto.ts` (both the Strapi TS and WordPress PHP versions)** — correct AES-256-GCM: fresh IV per call, auth tag verified on decrypt with a hard failure on tamper, keys sourced from env, no hardcoding.
5. **Strapi's filter-injection defense** (`strapi-cms/src/index.ts:187-189`) — the tenant filter is always ANDed with caller-supplied filters via `$and`, not shallow-merged, closing off the classic `$or`-based tenant-filter-escape.
6. **`media-meta` custom controller** — a well-reasoned, purpose-built fix for the fact that `@strapi/upload`'s own routes bypass the Document Service entirely; re-implements correct tenant scoping rather than leaving media unscoped.
7. **`app/api/strapi/[...path]/route.ts`** — a deliberately allowlisted BFF proxy with a self-documenting comment on why an open proxy would be dangerous. Exactly the discipline that should have extended to `/api/ai/*` (C1) but didn't.
8. **`custom-role-enforcement.php`'s actual enforcement logic**, where it does apply — correctly identifies a WordPress-version-specific hook quirk from a live repro, distinguishes publish/unpublish transitions correctly, and explicitly reasons about fail-open vs. fail-closed per scenario.
9. **`e2e/tests/mfa-enforcement.spec.ts`** — genuinely strong: drives the real UI, backdates a real clock instead of mocking time, waits out the real cache TTL, verifies against Strapi directly. The standard the missing cross-tenant-isolation test (C7) should be built to.
10. **PreviewBridge origin-checking** (`public-site/templates/_builder/PreviewBridge.tsx`) — real `postMessage` origin validation before trusting cross-frame messages.
11. **RSS/ICS feed builders do their own explicit escaping** rather than string-concatenating CMS content into XML/ICS — a class of bug (header/markup injection) that's easy to get wrong, done right here.
12. Consistent bilingual (TH/EN) fallback convention applied everywhere on public-site, documented once and followed by every caller.

---

## Recommended order of work

**This week (Critical):**
1. Fix C1 (ai/search + ai/index tenant trust) — small, surgical, highest exploitability.
2. Fix C2 (console export tenant resolution) — same shape, same fix pattern as C1.
3. Add `block-type`/`icon`/`release`/`review` to Strapi's `SCOPED` set (C3).
4. Add the 6 missing post types to WordPress's governed maps (C4).
5. Fix the MCP/CLI create/update field-stripping (C5).
6. Gate or remove the hardcoded editor passwords in seed.ts (C6).
7. Write the one cross-tenant-isolation e2e test (C7) — do this alongside 1-4, not after, so the fixes are pinned immediately.

**Next (High):** H1 (custom-role read scoping — small fix), H5 (Next.js patch bump — trivial), H6/H7 (LiteLLM auth + port binding — deployment config, no code change), H11 (strapi Dockerfile USER — trivial). H2/H3 (sanitization) is the biggest single chunk of remaining work but also the highest-value — budget real time for it rather than a quick patch.

**Then:** work through the Medium list, prioritizing M2/M3/M16 (the "hand-maintained list" root causes) since fixing the *pattern* prevents the next instance of C3/C4/M3, not just the currently-known ones. The Low/code-quality list is good backlog material, not urgent.

**Structural investment worth considering separately:** `governance.ts`'s size (M1) and the duplicated-list pattern (M2/M3/M16) are the same underlying problem showing up in two codebases. A schema-driven approach — "any content type with a `tenant` relation is automatically scoped and automatically gets Editor/Author publish permissions" — would convert this whole class of bug from "found one at a time in production" (the documented history in this codebase) to "structurally impossible."
