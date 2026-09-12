# WebX — handoff for next session

**As of:** 2026-09-11 (later same day) · `main` @ `c86c341` plus uncommitted
changes below. **Working tree:** dirty — see "New this pass" below; not yet
committed or pushed.

This covers Phase 9 (the WebX Agent: durable jobs, harness, plans, templates,
schedules) plus two things done outside that plan in the original session:
per-tenant MFA enforcement, and a marketing-site review/fix. A later pass
the same day live-verified M5/M6, fixed the tenant-cache bug, and closed
the content-usage auth gap — both were only *found* in the original pass,
not fixed yet at that point.

## New this pass (uncommitted)
1. **Fixed** the tenant-list cache bug (`strapi-cms/src/middlewares/tenant.ts`
   + new `strapi-cms/src/api/tenant/content-types/tenant/lifecycles.ts`) —
   the HTTP-level cache now invalidates on tenant create/update/delete
   instead of only refreshing every 30s. Not yet re-tested against a real
   fresh signup (the original repro); `tsc --noEmit` clean on strapi-cms.
2. **Fixed** the `/api/cms/content-usage` auth gap
   (`webx-studio/lib/cms/governance.ts`'s `contentUsageFor`) — now requires
   a session and scopes to the caller's own tenant (same
   `assertCanActOnTenant` pattern as `complianceSecuritySignal`), an
   unscoped admin still sees any. Live-verified: dga-editor's own tenant
   still returns `{contentTotal: 103}`, a cross-tenant request now 403s
   with `Cross-tenant operation not permitted`, and the real `/billing`
   page still renders its usage bar correctly. `tsc --noEmit` clean on
   webx-studio.
3. **Live-verified** M5 (`audit_all` to completion; `bulk_create`'s
   retry/pause behavior, not yet a full successful run) and M6 (a schedule
   actually firing, exactly once, with the compare-and-set advance
   working) — see the M5/M6 section below for the full detail.

---

## 1. Phase 9 — WebX Agent

Plan file (if still present): `C:\Users\akarapol\.claude\plans\atomic-sniffing-wand.md`.

| Milestone | Status | Commit |
|---|---|---|
| M0/M1 — resumable engine, `Continue` | done | `2e758dc` |
| M2 — retries, compaction, stuck detection, schema tool | done | `b36aa8b` |
| M3 — plans, questions, verification | done | `621c2be`, `4719895` |
| M4 — durable background jobs (leases, worker, acting session) | done | `de3e340` |
| M5 — job templates, Jobs tab, JobDetail, JobsIndicator, Continue in background | done | `ed6151b` |
| M6 — schedules, recurrence, Schedules tab, `agent-scheduler` service | done | `7892dca` |
| **M7 — live eval runner, CI eval workflow** | **not started** | — |

### What's built and unit/e2e-tested (mocked backend)
- Engine: checkpoint/resume, retry+backoff, compaction, stuck detection,
  plan/checklist, `ask_user`, verification pass.
- Tools: `lib/agent/tools.ts` — read/draft/submit tools over `governed.*`,
  page-building tools, deny-list on publish/unpublish/delete (enforced, not
  just documented).
- Jobs: `lib/agent/jobs/{runner,direct,templates,owner,schedules}.ts` +
  `lib/agent/worker.ts` (in-process worker, leases via
  `strapi-cms/src/api/internal/controllers/agent-jobs.ts`).
- Templates: `bulk_create` (agent-run, fixed plan), `bulk_translate` /
  `audit_all` (direct, no model — one tool call per item), `custom`.
- Schedules: `lib/agent/recurrence.ts` (daily/weekly/monthly, Asia/Bangkok,
  15-min steps) + `lib/agent/jobs/schedules.ts` (decide/skip/disable logic,
  compare-and-set advance). Tick endpoint:
  `app/api/internal/agent/tick/route.ts`, hit every 60s by the new
  `agent-scheduler` compose service.
- UI: `/agent` → Chat / Jobs / Schedules / Settings tabs
  (`components/agent/AgentWorkspace.tsx`), `JobsIndicator` in the topbar,
  `ContinueInBackground` on a resumable chat stop.
- 189 unit tests, `tsc` clean on webx-studio and strapi-cms.
- `e2e/tests/agent-panel.spec.ts` — 13 mocked-backend UI tests (no real
  LiteLLM needed), all passing.
- `e2e/tests/agent.spec.ts` — real-backend run against a mock LLM server,
  needs `DGA_EDITOR_PASSWORD` + `STRAPI_SCHEDULER_PASSWORD` env vars.

### What was verified live (real Kimi via LiteLLM, real dga tenant)
- M4: a job ran as dga-editor, created an unpublished FAQ draft, audit log
  correctly attributed the writes to `actor:agent` / `targetRef:job:<id>`,
  one-running-job-per-owner and cancel both worked.

### M5/M6 — now live-verified (2026-09-11, later same day)
- **`audit_all`** (Audit content template, FAQ, 9 entries): started from the
  UI, ran to Done end-to-end with 0 AI tokens (as designed — it's the
  no-model template) — 9/9 checked, 9 findings, autonomy READ ONLY. TH/EN
  toggle not separately re-checked this pass.
- **`bulk_create`** (Create drafts, FAQ): started from the UI, worker
  claimed/heartbeat/checkpointed it correctly (confirmed in strapi-cms's own
  http log), but every AI call failed because **the LiteLLM proxy isn't
  running in this dev environment** (port 4000 unreachable — Docker
  Desktop wasn't started, so the `docker-compose --profile ai` `litellm`
  service never came up). The job's own retry+pause behavior handled this
  correctly: 4 retries, then `Stopped: Paused — the AI service is busy or
  unreachable`, no crash, no partial/corrupt draft. That pause/resume path
  is now real-verified; the actual successful draft-creation path (real
  Kimi call → persisted draft) is **still unverified** — needs LiteLLM up
  (`pip install "litellm[proxy]"`, real `MOONSHOT_API_KEY` +
  `LITELLM_MASTER_KEY`, `litellm --config litellm/config.yaml --port 4000`,
  or start Docker Desktop and `docker compose --profile ai up litellm`)
  before re-running this template to completion.
- **M6**: created a real weekly schedule (`audit_all`, FAQ), turned on
  Schedules for the workspace (Settings → Agent autonomy →
  "Scheduled jobs"), force-set `nextRunAt` to a past timestamp via a direct
  Strapi write (content-manager, logged in as the `scheduler@webx.local`
  Super Admin service account — `agent-schedule` isn't exposed to a normal
  editor's content-manager role, by design), then called
  `POST /api/internal/agent/tick` (with `x-internal-secret`) twice back to
  back: tick 1 → `{due:1, started:[<jobId>]}`, tick 2 (immediately after) →
  `{due:0, started:[]}`. Exactly one job was created, it ran to Done (9/9),
  and the schedule's `nextRunAt` correctly advanced to the next occurrence
  (next Monday 09:00) rather than staying due. The compare-and-set advance
  in `strapi-cms/src/api/internal/controllers/agent-schedules.ts` is now
  real-verified, not just unit-tested. The test schedule was turned off
  afterward (its own Delete button uses a native `confirm()` that this
  session's browser automation couldn't drive — turned off instead, which
  is an equally valid stop; a person can delete it from
  `/agent/schedules` any time).

### Dev-environment note (new, found this session)
Both `strapi-cms` and `webx-studio` dev servers **silently exited (code 0,
not a crash) after ~8–12 minutes** of this session's own background
`preview_start` runs, twice each. Cause not diagnosed — didn't reproduce
with an error, no OOM/log signal, and Strapi's own admin-login rate
limiter wasn't involved. Restarting (`preview_start` again) picked up
right where it left off both times (SQLite state persisted). If a future
session sees the same thing, it's not necessarily a regression from this
session's own tenant-cache change — worth a closer look if it keeps
happening, but not chased further here.

### M7 — still not started
`eval/agent/run.mjs`, cases, `baseline.webx-kimi.json`,
`.github/workflows/agent-eval.yml`. See the plan file's M7 row for the
full spec (checks: `entries_created`, `review_filed`, `plan_complete`,
`stop_not_in`, `protocol_repairs == 0`, `tool_errors_lte`, `no_publish`,
`no_cross_tenant`). Given M5's bulk_create still has an unverified
successful-completion path (see above), a real LiteLLM run of at least
one bulk_create end-to-end would be worth doing before baselining M7
against it — no point locking in an eval baseline for behavior that's
only ever been seen failing gracefully, never succeeding.

### To resume live testing
```
# From D:\Claude\WebX
# Strapi
cd strapi-cms && npm run develop
# webx-studio (separate shell)
cd webx-studio && npm run dev   # port 3001; port 3000 is FinanceX, a different project on this machine
```
Sign in as `dga-editor@dga.local` (Strapi tab in the login screen). Its
password is in `strapi-cms/src/seed/seed.ts` (search for `dga-editor`) —
also usable as `DGA_EDITOR_PASSWORD` for e2e runs. `STRAPI_SCHEDULER_PASSWORD`
is in `webx-studio/.env.local`.

**Known friction, not bugs:** both webx-studio's own login rate limiter and
Strapi's native admin-login rate limiter are in-memory and will trip after
repeated test logins in one dev session — restart the affected dev server
to clear it (`preview_stop` + `preview_start`, or ctrl-C + rerun) rather
than waiting out the cooldown. The webx-studio↔Strapi tenant cache is
30s — a change made by editing Strapi data directly (bypassing
`governance.ts`) won't show up in the app for up to 30s.

---

## 2. Per-tenant MFA enforcement — done, `002cdbf`

Not part of the Phase 9 plan; a separate ask. A workspace admin can require
every admin in their workspace to enable 2FA (default: not required).
14-day grace period with a dismiss-free reminder banner, then every page
(except the security page itself) is replaced by a blocking panel with
enrollment embedded — sign-out always stays reachable, and the block lifts
the instant the user acknowledges their recovery codes (not on TOTP confirm
— that would yank the once-only recovery screen away before it's seen).
Skipped for SSO-enabled tenants and WordPress-engine sessions.

Key files: `lib/cms/governance.ts` (`getSecuritySettings`,
`saveMfaRequirement`, `mfaEnforcementStatus`), `components/MfaRequirement.tsx`
(new), `components/Security.tsx`, `components/Shell.tsx`,
`app/(app)/layout.tsx`. New e2e spec:
`e2e/tests/mfa-enforcement.spec.ts` — signs in as dga-editor, toggles the
requirement on through the real UI,
backdates the grace deadline via a direct Strapi write, waits out the real
30s tenant-cache TTL, confirms the block, enrolls with a real computed TOTP
code, confirms the block lifts only after acknowledging recovery codes,
and restores dga's tenant row to its exact original state afterward. Run it
the same way as `agent.spec.ts` (needs `DGA_EDITOR_PASSWORD` +
`STRAPI_SCHEDULER_PASSWORD`); it takes ~50s because of the deliberate 31s
cache wait.

---

## 3. Marketing site — reviewed and fixed, `232775f`

`marketing-site/` (bilingual TH/EN static-export site, `npm run dev` on
port 3200, `.claude/launch.json` name `"marketing-site"`).

### Fixed: real customer data in product screenshots
`public/shots/{dashboard,builder,analytics}.webp` used to be captured by
logging into **DGA's real, live tenant** as `dga-editor@dga.local` — the
images showed DGA's real org name, that real login email in plain text on
screen, and real DGA content (a live ThaID page, real traffic numbers).
Replaced with a dedicated fictional showcase tenant:

- Tenant key `webx-showcase`, org name "เทศบาลตัวอย่าง" (Sample
  Municipality), created through the product's own self-serve signup —
  not a seed-script tenant like dga/pea/orst/royalsociety.
- Login `demo-editor@webx.io`. **Password lives only in
  `marketing-site/.env.local`** (gitignored, not recoverable from git — if
  lost, either reset it via Strapi's admin API or sign up a fresh key).
- Seeded with one landing page (hero + feature-grid blocks rendered; a
  third `stat-row` block didn't persist — `BLOCKS 2` not 3 in the builder;
  cosmetic, not investigated) and 3 `api::service.service` entries.
- `scripts/capture-shots.mjs` no longer has a hardcoded password default
  (errors loudly if `SHOT_PASSWORD` is unset) and its email default now
  points at the showcase account. Re-run with:
  ```
  cd marketing-site && npm run shots
  ```
  (needs `SHOT_EMAIL`/`SHOT_PASSWORD` in the shell env, e.g. sourced from
  `.env.local`).

**Rule for anything shown publicly on this site going forward: never a
real customer's tenant, login, or content — use `webx-showcase` or create
a fresh disposable one the same way.**

### Added: first real coverage of the in-product Agent
The site's "agents" section previously only described the external
MCP/CLI integration (`list_content_types`, `create_entry`, etc. — no
publish/delete tool). It said nothing about the actual Phase 8/9 in-product
agent (docked panel, autonomy levels, background jobs, schedules) — a real,
differentiated feature with zero marketing presence. Expanded the section
(both locales) with: an intro on the built-in agent, an autonomy-level
ladder (Off → Read only → Suggest → Draft → Draft + submit), three
capability call-outs (plans into a visible checklist / runs in the
background / can be scheduled), keeping the MCP tools card as a secondary
"automate it yourself" option below. New `clock` icon in `components/Icon.tsx`.
Verified live in EN and TH; `tsc --noEmit` clean.

### Found this pass, fixed in the later pass the same day
1. **`strapi-cms/src/middlewares/tenant.ts`** caches the full tenant list
   for 30s with **no invalidation on tenant creation**. A brand-new
   tenant's `?tenant=<key>` requests (e.g. the analytics-summary endpoint
   `governance.ts`'s `tenantItemCount`/`enforceItemLimit` call for
   plan-limit checks) can silently resolve to a *different*, stale-cached
   tenant's data until the 30s window passes. **Reproduced live**: a
   freshly signed-up tenant's very first content-create call was rejected
   because the limit check saw an unrelated tenant's item count. This is a
   real onboarding-breaking bug for any brand-new self-serve signup, not
   just marketing-site tooling — `webx-studio`'s own `tenantCache` already
   does the right thing (`invalidateTenantCache()` on every write); this
   was a *separate*, un-invalidated cache inside strapi-cms itself.
   **Fixed** — see "New this pass" above. Not yet re-verified against a
   fresh signup specifically (only `tsc` + the existing lifecycle-hook
   pattern was checked); worth a quick real signup test before trusting it
   fully.
2. **`GET /api/cms/content-usage`** (webx-studio) had no `requireUser()` /
   auth check at all and trusted the `?tenant=` query param outright.
   **Fixed and live-verified** — see "New this pass" above.

Full detail and the original repro steps for both are saved in this
machine's Claude memory: `project_webx_marketing_site.md` (via the memory
index at `MEMORY.md`) — that memory is now stale on this point and should
be updated to say "fixed" next time it's touched.

---

## 4. Suggested order for next session

1. Real-signup re-test of the tenant-cache fix (sign up a fresh disposable
   tenant, confirm its very first content-create isn't blocked by a stale
   neighbor's item count) — the fix is in and typechecks, but wasn't
   re-run against the original repro.
2. Get LiteLLM actually running in this dev environment (Docker Desktop
   wasn't up this pass — see "Dev-environment note" above) and re-run
   `bulk_create` to a real successful completion, not just its
   already-verified pause-on-failure path.
3. Build M7 (the eval harness) now that M5/M6's live behavior is mostly
   confirmed — bulk_create's successful path from #2 above is the one
   remaining gap worth closing first, so the eval baseline isn't locked in
   against untested behavior.
4. Decide whether to commit the three uncommitted changes from this pass
   (tenant-cache fix, content-usage auth fix) — nothing was committed or
   pushed this pass.

---

*Generated by Claude (Sonnet 5) at the end of the 2026-09-11 session. Also
saved to this machine's persistent memory (`~/.claude/projects/D--Claude-WebX/memory/`)
so a fresh session has the durable facts even without this file.*
