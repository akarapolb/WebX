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
npm test                    # all 3 suites
npm run test:public         # public-site rendering + nav-overlap regression check only
npm run test:studio         # WebX Studio round trip (needs WP_ADMIN_APP_PASSWORD)
npm run test:wp-admin       # WordPress admin direct edit (needs WP_ADMIN_PASSWORD)
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

## Suite 3 — WordPress admin direct edit

Needs `WP_ADMIN_PASSWORD` — the wp-admin user's **real interactive password**, not the Application Password above (WordPress's login form rejects Application Passwords by design). Set it yourself; this suite is skipped entirely if it's absent:

```bash
export WP_ADMIN_PASSWORD="the real wp-admin password"
npm run test:wp-admin
```

Logs directly into `/wp-admin`, edits an Org Unit's excerpt through WordPress's own edit screen (not through WebX Studio at all), and verifies the change via REST — confirming the Phase 10 content types are genuinely editable by an admin who never opens WebX Studio, not just through it.

## Config

`WP_ADMIN_USER`, `PUBLIC_SITE_URL`, `WEBX_STUDIO_URL`, `STRAPI_URL`, `WORDPRESS_URL` are all overridable via env vars (see `tests/_helpers.ts`) — the defaults match this repo's standard local dev ports.
