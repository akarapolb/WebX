# Deploying WebX Studio

Two supported paths. Pick by audience:

| Path | Best for | What you run |
|---|---|---|
| **A. Docker Compose** | self-host, on-prem, DGA / air-gapped, a quick full-stack demo | one host, `docker compose up` |
| **B. Managed (Vercel + hosted Strapi)** | public SaaS demo, zero ops | Vercel for the admin, a Strapi host + Postgres |

Both use **Postgres + pgvector** in production (SQLite is dev-only).

---

## A. Docker Compose (full stack)

Brings up Postgres+pgvector, Strapi, WebX, and (optionally) the LiteLLM gateway.

```bash
cp .env.production.example .env
# fill DATABASE_PASSWORD + the 5 Strapi secrets:
node -e "for(const k of['APP_KEYS','API_TOKEN_SALT','ADMIN_JWT_SECRET','TRANSFER_TOKEN_SALT','JWT_SECRET'])console.log(k+'='+require('crypto').randomBytes(16).toString('base64'))"
# (APP_KEYS wants 2+ comma-separated keys — run twice and join with a comma)

docker compose up -d --build              # db + strapi + webx
docker compose --profile ai up -d --build # also start LiteLLM
```

- WebX → http://localhost:3000  ·  Strapi admin → http://localhost:1337/admin
- First run: open the Strapi admin and create the first admin user.
- AI: set `LITELLM_URL=http://litellm:4000` (+ a provider key) in `.env`, or
  leave it empty — every AI feature degrades gracefully.
- RAG at scale: set `WEBX_VECTOR=pgvector` and `PGVECTOR_URL` to the bundled db.

Services declare `healthcheck`s; `docker compose ps` shows health. Uploads and
DB persist in named volumes (`strapi-uploads`, `db-data`).

---

## B. Managed (Vercel + hosted Strapi)

1. **Strapi** — deploy `strapi-cms/` to a Node host (Render / Railway / a VM)
   with a managed **Postgres** (enable the `pgvector` extension). Set
   `DATABASE_CLIENT=postgres` + `DATABASE_URL` and the five Strapi secrets.
2. **WebX** — import `webx-studio/` into **Vercel**. Set `STRAPI_URL` to the
   Strapi URL, plus `LITELLM_*` / `WEBX_VECTOR` / `PGVECTOR_URL` as needed.
   `output: "standalone"` is already set; Vercel builds it directly.
3. **LiteLLM** (optional) — run as its own service (Render/Fly) with a Redis
   cache; point `LITELLM_URL` at it. Mint per-tenant virtual keys with budgets.

---

## Production checklist

- [ ] All five Strapi secrets + `DATABASE_PASSWORD` set to strong random values.
- [ ] HTTPS/TLS terminated in front (reverse proxy / platform).
- [ ] CORS + trusted proxy configured for the public WebX origin.
- [x] Backups: nightly `pg_dump` + the uploads volume — the `db-backup` service, local disk only (see `BACKUP_KEEP`/`BACKUP_INTERVAL_SECONDS` in `.env.production.example`). Off-site storage is still on you.
- [x] WordPress engine backups: nightly `mysqldump` + the wp-content-data volume — the `wp-db-backup` service (profile `wordpress`), same local-disk-only caveat as above. This previously did not exist at all — every `engine:"wordpress"` tenant's actual content had zero backup coverage (TOR gap audit).
- [x] Quarterly restore drill automated (`strapi-cms/scripts/restore-test.js`, DR-Plan.md §3/§6) — restores the latest backup into a disposable scratch database (never the live one) and runs a real integrity check, instead of the previous written-policy-only "test restore quarterly" line with nothing behind it. Schedule it the same way as `backup-db.js` (see DR-Plan.md), just quarterly instead of hourly/nightly.
- [x] Access-log retention: both engines now enforce a real ≥90-day floor (configurable via `TRAFFIC_LOG_RETENTION_DAYS` on Strapi, `WEBX_ACCESS_LOG_RETENTION_DAYS` on WordPress — `strapi-cms/src/middlewares/traffic-log.ts`, `wordpress/mu-plugins/access-log.php`) with an actual purge, not just "never deletes anything." WordPress previously had no access logging at all (TOR gap audit) — deploy `access-log.php` the same way as any other mu-plugin change (see below).
- [x] PII encryption at rest: `contact-message`/`registration` name/email/phone are AES-256-GCM encrypted in the database (`strapi-cms/src/utils/pii-crypto.ts`), transparent decrypt-on-read for the admin API. Requires `PII_ENCRYPTION_KEY` (32 raw bytes, base64) — see `.env.production.example`.
- [ ] `DATABASE_SSL=true` (+ `DATABASE_SSL_CA` if the DB provider needs a custom CA) once Strapi and the database are not on the same trusted private network — off by default for same-network/docker-compose deployments.
- [x] WordPress base image pinned (`wordpress/Dockerfile`'s `FROM wordpress:7.1-php8.3-apache`, was `:latest` — TOR gap audit: `:latest` silently pulled in a new WordPress core / PHP / OS patch level on every rebuild, with no diff to review before it hit production). Bump this string deliberately, on its own change, when the org decides to upgrade — never let a routine rebuild carry a silent core upgrade.
- [ ] File-permission / OS hardening on whatever host actually runs these containers: WordPress's own uploads directory (`wp-content/uploads`) should not be script-executable (`php_admin_flag engine off` in an nginx/Apache location block, or the equivalent for the real reverse proxy in front of it — not configurable from inside this repo, since it depends on the real host's web-server config); container filesystems should run read-only where the image allows it, with only the actual data volumes (`wp-content-data`, `strapi-uploads`, the Postgres/MySQL data dirs) writable; and the containers should run as their images' own non-root user (verify with `docker inspect --format '{{.Config.User}}'` — the official WordPress/Strapi images already default to this, so the risk is a deploy script overriding it with `--user root`, not the base images themselves).
- [ ] Least-privilege Strapi API token for the MCP/CLI (review find/create only
      if those tools are used).
- [ ] PDPA: submission content types are **not** public-readable (verify roles).
- [ ] Cookie TTLs match Strapi `auth.sessions.*` lifespans.
- [ ] WordPress engine, if used: after adding or changing a file under
      `wordpress/mu-plugins/`, an image rebuild alone does **not** update an
      already-running deployment — the official WordPress entrypoint only
      seeds mu-plugins into the bind-mounted volume on a genuinely empty
      volume (first boot). On a running deployment, copy the changed file in
      directly and restart:
        ```
        docker compose cp wordpress/mu-plugins/custom-role-enforcement.php \
          wordpress:/var/www/html/wp-content/mu-plugins/
        docker compose restart wordpress
        ```
      (A fresh volume — e.g. a new environment — picks it up automatically
      via the Dockerfile's `COPY mu-plugins/` line, no manual step needed there.)
      The same applies to `wordpress/blocks/` (the native Gutenberg block
      sources) after running `npm run build` there — copy `blocks/build/`
      into the running container's `mu-plugins/webx-blocks/` the same way:
        ```
        docker compose cp wordpress/blocks/build/. \
          wordpress:/var/www/html/wp-content/mu-plugins/webx-blocks/
        docker compose restart wordpress
        ```
      Same again for `wordpress/theme/webx-theme/` (the custom theme — TOR
      gap audit) — a fresh volume picks it up and activates it automatically
      via the Dockerfile's `COPY theme/...` line + bootstrap.sh's
      `wp theme activate webx-theme`; an existing deployment needs both a
      manual copy AND activation (themes, unlike mu-plugins, need an
      explicit activation step):
        ```
        docker compose cp wordpress/theme/webx-theme \
          wordpress:/var/www/html/wp-content/themes/webx-theme
        docker compose exec wp-cli wp --path=/var/www/html --allow-root \
          theme activate webx-theme
        ```

### WordPress engine — seeding real content (ORST / RoyalSociety)

Two separate layers of "empty on a fresh clone," fixed two separate ways:

**1. The tenant records themselves.** ORST and RoyalSociety's Strapi
`Tenant` rows (name/brand/contact/engine:"wordpress"/...) now seed
**automatically** on every Strapi boot (`seedOrstRoyalSocietyTenants` in
`strapi-cms/src/index.ts`'s `bootstrap()`, same as DGA/PEA's own tenant
rows) — nothing to run by hand for this part. This closes a real gap: before
this existed, a fresh clone's Strapi never created either tenant at all
(the older `seedTenants()` only ever listed dga/pea), which silently broke
everything downstream — no `/api/tenants/keys` entry, no jobs, nothing.

**2. WordPress's own content.** A fresh WordPress install (via
`bootstrap.sh` above) only gets an empty database — the mu-plugins register
the content *types* (pages, polls, jobs, members, events, ...), but none of
the real ORST/RoyalSociety content exists yet until someone runs the seed
scripts under `wordpress/seed-*.mjs`. These are one-off migration scripts,
not part of the app itself — each talks to the running WordPress instance's
own REST API (same `WORDPRESS_URL` / `WORDPRESS_SCHEDULER_USERNAME` /
`WORDPRESS_SCHEDULER_APP_PASSWORD` webx-studio itself uses, read from the
environment or `webx-studio/.env.local`), so they work against any real
deployment, not just this dev machine. All are safe to re-run — each one
either matches-and-updates an existing row instead of duplicating it, or
explicitly no-ops if its target already exists.

Run once, in this order, against a fresh install (skip any tenant you're
not deploying) — **make sure Strapi has booted at least once first**, so
step 1 above has already created the tenant records these scripts look up:

```bash
node wordpress/seed-tenants.mjs              # the `wtenant` taxonomy terms — every script below needs these to exist first
node wordpress/seed-orst-layout.mjs          # ORST's real pages (home/about/contact/services/...)
node wordpress/seed-royalsociety-layout.mjs  # RoyalSociety's real pages
node wordpress/seed-orst-sources.mjs         # binds live-data sources (services, FAQs, ...) to ORST's blocks
node wordpress/seed-events.mjs               # sample event-calendar entries, both tenants
node wordpress/seed-members.mjs              # sample Fellows/Associate Members directory, both tenants
node wordpress/seed-royalsociety-documents.mjs  # RoyalSociety's ITA transparency documents
node wordpress/seed-event-calendar-blocks.mjs   # wires the event-calendar block into both tenants' pages (needs the two layout scripts + seed-events.mjs first)
node wordpress/seed-member-directory-blocks.mjs # wires the member-directory block into both tenants' about pages (needs the two layout scripts + seed-members.mjs first)
node wordpress/seed-en-content-blocks.mjs       # English-language block content (bilingual EN)
node wordpress/seed-public-forms.mjs            # the real homepage poll (ORST) + real job postings (both tenants' careers pages)
```

`seed-public-forms.mjs` needs `seed-orst-layout.mjs` to have already run
(it patches the poll block on ORST's already-seeded homepage) — everything
else about it is self-contained. It deliberately never seeds
complaint/application/contact-message/breaking-news rows — those are
citizen-submitted or admin-authored at runtime, not content with a real
starting value the way a poll question or a job posting has.

## WebX Agent background jobs and schedules

Background jobs (the Jobs tab on `/agent`) run inside the `webx` processes
themselves, so there is nothing extra to deploy for them:

- Each `webx` process starts a worker when it boots (`webx-studio/instrumentation.ts`)
  unless `AGENT_WORKER_ENABLED=0`. Jobs are leased in Strapi, so several
  replicas can share one database; `AGENT_WORKER_CONCURRENCY` (default 3) is
  the number of jobs one process runs at a time.
- Workers reach Strapi's `/api/internal/agent-jobs/*` endpoints with the
  shared internal secret (`STRAPI_INTERNAL_SECRET`), and act as each job's
  owner through the `STRAPI_SCHEDULER_*` service account.
- On `docker compose stop`, running jobs finish their current turn and go
  back to the queue (`stop_grace_period: 30s`). Anything slower is picked up
  again once its lease expires.

Schedules (recurring jobs, the Schedules tab) need a tick. The
`agent-scheduler` service in `docker-compose.yml` calls
`POST /api/internal/agent/tick` with `WEBX_SCHEDULER_SECRET` every
`AGENT_SCHEDULER_INTERVAL_SECONDS` (default 60). On another platform, point
any cron at that endpoint about once a minute; overlapping ticks are safe,
because a schedule only advances by compare-and-set. The tick also wakes the
worker in whichever `webx` process answers it.

Both stay off in every workspace until a workspace administrator turns on
**Background jobs**, and separately **Schedules**, in Agent settings, and the
plan must include them (`webx-studio/lib/plans.ts`). A schedule runs as the
person who saved it for 90 days, then turns itself off until they turn it on
again. It also turns off if they lose access to the workspace, if the agent's
permissions drop below what the job needs, or after three failed runs in a
row. Strapi deletes finished jobs after 90 days (their checkpoints after 7)
and turned-off schedules after 180.

## DGA / government on-prem notes

- Self-host path **A** keeps everything inside the agency network — no third-party
  hop, which matters for PDPA. Point AI at a **local model** (`webx-local`/Ollama)
  for sensitive tenants.
- **DR (RTO/RPO):** run a warm standby — stream Postgres WAL to the DR site and
  replicate the uploads volume; the stack is stateless apart from db + uploads,
  so failover is "point DNS at the standby". (TOR Security: DR site.)
- Penetration test before go-live (TOR งวด 4); the BFF token isolation,
  field-RBAC, rate-limiting, and PDPA role checks are the surfaces to validate.

## `public-site`'s own build-time env vars

`public-site` is a separate static export (`output: "export"`, built with
`npm run build`, deployed to its own static host — not part of the Docker
Compose stack above). See `public-site/.env.example` (copy to `.env.local`,
gitignored — not committed). Two of its env vars matter specifically for the
orst/royalsociety delivery, which is genuinely **two different production
domains** (`www.orst.go.th`, `www.royalsociety.go.th`), not one site with two
paths:

- `PUBLIC_SITE_URL_ORST` / `PUBLIC_SITE_URL_ROYALSOCIETY` — each tenant's real
  `https://` origin, used to build absolute OG/canonical URLs, the RSS feed's
  `<link>`/`atom:link`, and each `.ics` calendar's `UID` domain
  (`public-site/lib/seo.ts`'s `siteUrlFor()`). **Set both before go-live** —
  left unset, both tenants fall back to the same shared default and one
  tenant's meta tags/feed links end up pointing at the other tenant's domain
  (or `localhost` in dev).
- `PUBLIC_SITE_URL` — shared fallback for any tenant without its own var
  above (fine for a single-domain staging deploy), and the local dev default.
- `NEXT_PUBLIC_WORDPRESS_URL` / `NEXT_PUBLIC_STUDIO_ORIGIN` — WordPress REST
  API base and the Visual Builder preview's allowed parent origin. Both
  default to the standard local dev setup (`localhost:8081`/`localhost:3000`)
  so local dev needs no `.env.local` at all; set both for a real deployment.
