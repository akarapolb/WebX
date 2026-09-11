# WebX — handoff for next session

**As of:** 2026-09-11 · `main` @ `232775f`, pushed and in sync with `origin/main`.
**Working tree:** clean, nothing pending.

This covers Phase 9 (the WebX Agent: durable jobs, harness, plans, templates,
schedules) plus two things done outside that plan this session: per-tenant
MFA enforcement, and a marketing-site review/fix.

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

### What is NOT yet verified live (real gap — do this next)
- **M5**: a real `bulk_create` job (e.g. "draft every editorial content
  type") run to completion with the browser tab closed; `audit_all`
  started from the UI to done; the Jobs UI checked in both TH and EN.
- **M6**: a schedule actually firing for real (force `nextRunAt` to now,
  tick twice, confirm exactly one job created) — the schedule
  advance-in-one-transaction path in
  `strapi-cms/src/api/internal/controllers/agent-schedules.ts` has unit
  coverage but has never run against the real dev stack.
- **M7**: doesn't exist yet — `eval/agent/run.mjs`, cases, `baseline.webx-kimi.json`,
  `.github/workflows/agent-eval.yml`. See the plan file's M7 row for the
  full spec (checks: `entries_created`, `review_filed`, `plan_complete`,
  `stop_not_in`, `protocol_repairs == 0`, `tool_errors_lte`, `no_publish`,
  `no_cross_tenant`).

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

### Found, not fixed — real bugs worth a follow-up session
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
   does the right thing (`invalidateTenantCache()` on every write); this is
   a *separate*, un-invalidated cache inside strapi-cms itself that needs
   the same treatment.
2. **`GET /api/cms/content-usage`** (webx-studio) has no `requireUser()` /
   auth check at all and trusts the `?tenant=` query param outright — any
   caller, authenticated or not, can read any tenant's content/submission
   counts by guessing or knowing its key. Low severity (aggregate counts
   only, no PII) but should be scoped the same way `/api/cms/security`
   etc. already are.

Full detail and the repro steps for both are saved in this machine's
Claude memory: `project_webx_marketing_site.md` (via the memory index at
`MEMORY.md`), so a fresh session picks this up automatically without
needing this document.

---

## 4. Suggested order for next session

1. Decide: fix the tenant-cache bug now (real customer-facing risk, small
   fix — invalidate/refresh `tenant.ts`'s cache wherever a tenant is
   created) or file it and move on.
2. Live-verify M5 (`bulk_create` with tab closed, `audit_all` from UI, TH/EN
   check) and M6 (a schedule actually firing) — both are code-complete and
   unit-tested but never run for real.
3. Build M7 (the eval harness) once M5/M6's live behavior is confirmed
   correct — no point baselining an eval runner against behavior that
   hasn't been checked yet.
4. Close the `content-usage` auth gap (quick, unrelated to the above).

---

*Generated by Claude (Sonnet 5) at the end of the 2026-09-11 session. Also
saved to this machine's persistent memory (`~/.claude/projects/D--Claude-WebX/memory/`)
so a fresh session has the durable facts even without this file.*
