# WebX e2e suite

Playwright tests covering the full WebX Studio + WordPress + public-site pipeline. Added in Phase 10 — there was no test infrastructure anywhere in this repo before this.

## Pre-flight (this repo doesn't orchestrate these as one stack)

Before running the suite, have all 4 running yourself — Playwright does not start any of them (see `playwright.config.ts`'s comment for why public-site in particular is deliberately excluded from auto-start):

```bash
# Strapi + Postgres
cd .. && docker compose up -d
cd strapi-cms && npm run develop   # separate terminal, or already running

# WordPress (ORST/RoyalSociety content)
docker compose -f ../docker-compose.wordpress.yml up -d

# webx-studio
cd ../webx-studio && npm run dev   # :3000

# public-site — build fresh, then serve the static export
cd ../public-site && npm run build && npx serve out -l 8095
```

## Running

```bash
npm install
npx playwright install --with-deps chromium   # first time only
npm test                    # all suites
npm run test:public         # public-site rendering + nav-overlap regression check only
npm run test:studio         # WebX Studio round trip (needs WP_ADMIN_APP_PASSWORD)
npm run test:users          # user management + rebuild-now (needs STRAPI_SCHEDULER_PASSWORD)
npm run test:wp-admin       # WordPress admin direct edit (needs WP_ADMIN_PASSWORD)
npm run test:agent-panel    # WebX Agent docked panel + workspace UI (mocked backend, needs STRAPI_SCHEDULER_PASSWORD only)
npm run test:agent          # WebX Agent real backend run (needs DGA_EDITOR_PASSWORD + webx-studio pointed at the mock LLM — see Suite 5)
```

## Suite 1 — public-site rendering

No credentials needed. Runs against the built static export. Checks every page on both tenants (`orst`, `royalsociety`) for a clean load, no console errors, no broken image requests, no leftover `[bracketed]` placeholder text, and — as a standing regression guard for the header-nav overlap bug found and fixed in Phase 9/10 — that no two header controls visually overlap at 375/768/1280/1440/1920px.

## Suite 2 — WebX Studio round trip

Needs `WP_ADMIN_APP_PASSWORD` — a WordPress **Application Password** (Users → Profile → Application Passwords in wp-admin), the same kind already used by `webx-studio`'s own `.env.local` (`WORDPRESS_SCHEDULER_APP_PASSWORD`). Set it in your shell, never commit it:

```bash
export WP_ADMIN_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
npm run test:studio
```

Logs into WebX Studio with the WordPress engine, opens a Mission Item (a Phase 10 ACF-backed content type), edits its numeric `Order` field, saves, then verifies the change via a direct WordPress REST fetch — and restores the original value afterward so re-runs stay idempotent.

## Suite 3 — user management + rebuild-now

Needs `STRAPI_SCHEDULER_PASSWORD` (matches webx-studio's own `.env.local` — the seeded scheduler service account, a real Strapi super-admin) to log into WebX Studio's Strapi tab:

```bash
export STRAPI_SCHEDULER_PASSWORD="the scheduler account's password"
npm run test:users
```

Covers Users & Roles' own workspace picker (confirms it reaches a WordPress-engine tenant — `orst` — from a Strapi session, which the sidebar switcher deliberately never does), creating and removing a user against both a WordPress-engine and a Strapi-engine workspace (verified directly against each backend, not just the UI's own claim — a real login for the Strapi case, a real REST lookup for the WordPress case), and the Status page's "Rebuild now" button (waits for a real `next build` to complete, so this one runs slower than the rest). The WordPress round-trip test additionally needs `WP_ADMIN_APP_PASSWORD` (same as Suite 2) and is skipped without it.

## Suite 4 — WordPress admin direct edit

Needs `WP_ADMIN_PASSWORD` — the wp-admin user's **real interactive password**, not the Application Password above (WordPress's login form rejects Application Passwords by design). Set it yourself; this suite is skipped entirely if it's absent:

```bash
export WP_ADMIN_PASSWORD="the real wp-admin password"
npm run test:wp-admin
```

Logs directly into `/wp-admin`, edits an Org Unit's excerpt through WordPress's own edit screen (not through WebX Studio at all), and verifies the change via REST — confirming the Phase 10 content types are genuinely editable by an admin who never opens WebX Studio, not just through it.

## Suite 5 — WebX Agent, real backend run

Exercises the actual Phase 8 backend contract end to end: `POST /api/agent/run`'s
SSE event stream, the agent's own tool-calling turn loop actually writing a
real draft field through `governed.update`, and audit attribution
(`actor:"agent"`, `action:"agent_update"`). Needs a real **tenant-scoped**
session — the scheduler account used elsewhere in this suite always resolves
to autonomy level `"off"` (reason `"unscoped"`) by design (see
`governance.ts`'s `resolveAgentPolicy`), so it can never exercise a real run.

```bash
export STRAPI_SCHEDULER_PASSWORD="the scheduler account's password"   # also needed here, to flip dga's plan/policy and verify results directly
export DGA_EDITOR_PASSWORD="dga-editor@dga.local's password"          # strapi-cms/src/seed/seed.ts's own seeded dga tenant editor
```

Also needs the **already-running** webx-studio dev server to have been
started with `LITELLM_URL` pointing at the mock LLM server (port 4010) — env vars in
`lib/llm.ts` are read once at module load, not per request, so this can't be
injected per-test-run the way credentials above can:

```bash
# from webx-studio/, before starting the dev server for this suite:
echo "LITELLM_URL=http://localhost:4010" >> .env.local   # or edit the existing empty line
npm run dev
```

```bash
npm run test:agent
```

The test itself starts and stops `webx-studio/tests/harness/mockLlmServer.ts`
(a scenario-driven OpenAI-`/chat/completions`-compatible server — no real
model, deterministic: the `write-draft-field` scenario in
`webx-studio/tests/scenarios/` calls `write_draft_fields` against a real seeded
dga article on turn 1 and ends the run on turn 2). The server checks every
request webx-studio sends against the provider tool-calling protocol, and the
test fails if any request broke it (`GET /__mock/report`). The test also
temporarily bumps dga's plan + agent
autonomy level via the Strapi admin API so the run isn't blocked by either
gate — reverting both, and the article's own title, in `afterAll` regardless
of pass/fail. Revert `LITELLM_URL` back to empty (or remove the line) and
restart the dev server once you're done — leaving a mock LLM wired into a
normal dev session means every other AI feature (translate, per-field ✦
actions, `list_reviews`-style admin flows) would also start talking to the
mock instead of degrading gracefully or hitting a real model.

## Suite 6 — WebX Agent, docked panel + workspace UI

Pure UI coverage of `components/agent/*` (the docked panel, the `/agent`
full-page workspace) via `page.route()` mocks of every `/api/agent/*` call —
no LiteLLM, no mock LLM server, no tenant plan/policy setup, and it runs
against whatever the currently logged-in session's OWN tenant happens to be
(irrelevant, since nothing agent-related hits the real backend). Only needs
`STRAPI_SCHEDULER_PASSWORD` (for the login itself — `middleware.ts` gates
every route on a session cookie regardless of what's mocked).

```bash
export STRAPI_SCHEDULER_PASSWORD="the scheduler account's password"
npm run test:agent-panel
```

Covers: the topbar toggle + ⌘/Ctrl+J + open-state persistence across a
reload (`localStorage["webx_agent_open"]`), a streamed assistant reply
rendering from a canned SSE body, a tool-call + proposal rendering with
Apply correctly disabled when no matching editor is open (`targetMatches()`
in `AgentProvider.tsx`), the `"off"` empty state hiding the toggle/FAB
entirely, and the `/agent` workspace hydrating a mocked thread list plus its
Settings tab. Background jobs (Phase 9): a template previewed then started
from the Jobs tab opening the job's page (checklist, timeline, top-bar jobs
indicator), a job waiting for an answer shown in Thai and answered, the Jobs
tab with background jobs turned off, and **Continue in background** turning a
stopped conversation into a job.

## Config

`WP_ADMIN_USER`, `PUBLIC_SITE_URL`, `WEBX_STUDIO_URL`, `STRAPI_URL`, `WORDPRESS_URL`, `DGA_EDITOR_EMAIL`, `MOCK_LITELLM_PORT` are all overridable via env vars (see `tests/_helpers.ts`) — the defaults match this repo's standard local dev ports and seeded accounts.
