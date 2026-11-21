# Hosting plan: hosted CMS + rebuild on publish

Status: plan only. No accounts have been created and nothing is deployed.
Written for the DGA hub (`dgahub`) but applies to any WebX tenant on the
Strapi engine. Decisions still open with the client are marked **[decide]**.

## 1. What has to be true

- Editors publish in WebX Studio and the public site shows it within minutes,
  with no developer involved (today the static site changes only when someone
  runs a build; risk R-14).
- The public site stays a static export (fast, cheap, nothing to attack on the
  public host). Only a few browser features call the CMS: the AI assistant,
  forms, cookie-consent logging and search analytics.
- Personal data (form submissions, consent logs) stays in Thailand, on a host
  the agency controls (PDPA). AI answers can run on a local model.
- A bad build never replaces a good site.

## 2. Target layout

```
              agency network / VPN                         internet
 ┌───────────────────────────────────────────┐
 │ Studio (studio.<domain>, SSO, VPN only)    │
 │   │ publish                                │
 │   ▼                                        │
 │ Strapi CMS ──── Postgres (managed, backup) │    ┌──────────────────────┐
 │   │  uploads ─► object storage (S3 API) ───┼──► │ media.<domain> (CDN) │
 │   │  webhook: entry.publish / unpublish    │    └──────────────────────┘
 │   ▼                                        │
 │ CI runner: build + check + upload ─────────┼──► www.<domain> static host + CDN
 └─────┬─────────────────────────────────────┘          │ browser calls
       │ /api/assist, /api/<forms>, /api/consent-logs,  │
       └──────── cms-api.<domain> (WAF, rate limit) ◄───┘
```

| Part | Where | Notes |
|---|---|---|
| Strapi (`strapi-cms`) | Agency VM / government cloud (GDCC) **[decide]**, Docker (`docker-compose.yml`, path A in `DEPLOY.md`) | `DATABASE_CLIENT=postgres`; admin panel reachable only from the agency network |
| Postgres | Managed or same host, daily backup + WAL to the DR site | The only stateful part besides uploads |
| Uploads | S3-compatible object storage with a public read URL (Strapi upload provider) | Static pages link images by URL, so media must be public and outlive the CMS host |
| Studio (`webx-studio`) | Same network as Strapi, `output: "standalone"` container | SSO (`/sso`), VPN only |
| Public site | Static host + CDN (any: agency web server, GDCC object storage + CDN, or a commercial static host **[decide]**) | Upload the folder from `tools/webx/publish-dgahub.mjs` |
| Public CMS API | `cms-api.<domain>` → only the public `/api/...` routes the browser needs, behind a WAF | Same Strapi, different hostname; admin routes blocked at the proxy |
| LiteLLM (optional) | Next to Strapi; `webx-local` model for PDPA-sensitive tenants | See `litellm/README.md` |

## 3. Configuration

Public-site build (CI job environment):

| Variable | Value |
|---|---|
| `STRAPI_URL` | Internal CMS address the build reads, e.g. `http://strapi:1337` |
| `PUBLIC_SITE_URL` | `https://www.<domain>` (canonical links, sitemap, open-data catalogue) |
| `PUBLIC_CMS_URL` | `https://cms-api.<domain>` for assistant, forms, consent and search analytics; `off` for a fully static copy |
| `WORDPRESS_URL` / `PUBLIC_WORDPRESS_URL` | WordPress tenants only: the address the build reads, and the one browsers call (polls, banner, site search, captcha, forms); same rule as `PUBLIC_CMS_URL` |
| `NEXT_PUBLIC_STUDIO_ORIGIN` | `https://studio.<domain>` (allowed to drive the draft preview) |
| `CHECK_LINKS` | `dgahub` (default) or `*`: which tenants' internal links must resolve |

Strapi: CORS must allow `https://www.<domain>`; set `LITELLM_*` only if the
assistant should generate answers (it quotes passages otherwise). Secrets live
in the CI/host secret store, never in the repository.

The build fails (and nothing is uploaded) when `scripts/check-export.mjs` finds
a page that came out as an error, a page without `<main>`, broken hub links,
invalid JSON, or the build machine's CMS address in a JS chunk.

## 4. Rebuild on publish

Today Studio rebuilds in-process (`webx-studio/lib/publicSiteBuild.ts`:
debounced `npm run build` in the public-site folder). That suits one machine,
but it needs the public-site source inside the Studio container, and it deletes
the public-site `.next` folder, which breaks a `next dev` running in the same
checkout. The target replaces the local build with a call to a CI job:

1. **Trigger.** Strapi webhook on `entry.publish`, `entry.unpublish` and
   `entry.delete` for the tenant's content types (Settings → Webhooks), or
   Studio's existing `requestPublicSiteRebuild()` changed to POST to a build hook
   (`PUBLIC_SITE_BUILD_HOOK`, small code change, not made yet). A nightly
   scheduled run catches anything missed (e.g. a scheduled release).
2. **Debounce.** The CI job waits about 60 s and cancels queued runs for the
   same branch (one build per burst of publishes; GitHub Actions `concurrency:`
   with `cancel-in-progress`, or the equivalent in GitLab/Jenkins).
3. **Build.** `npm ci` → `npm run build` (includes `set-html-lang` and
   `check-export`) → `npm test` → `node tools/webx/publish-dgahub.mjs out-site`.
4. **Upload atomically.** Upload to a new versioned folder (`/releases/<build-id>/`),
   then switch the live pointer (symlink, CDN origin path or bucket alias).
   Keep the last 10 releases; rollback = switch the pointer back.
5. **Purge** the CDN cache for HTML, `sitemap.xml`, `search-index.json` and
   `/data/*` (hashed `/_next/` files never need purging).
6. **Report.** Post the result to Studio's Status page (build time, last error)
   and alert the web team on failure; the old site stays live.

Expected delay from Publish to live: about 3 to 5 minutes (60 s debounce +
~2 min build + upload). Agree the figure with DGA **[decide]**; R-14 asks for it.

## 5. Preview, analytics and security notes

- **Draft preview** works without a server: Studio posts unsaved blocks to the
  published site's `/dgahub/preview` page in an iframe. That page must be
  deployed (it is not indexed or linked) and `NEXT_PUBLIC_STUDIO_ORIGIN` must
  name the Studio host.
- **Search analytics** (`/api/search-stats/log`) stores counts per query only;
  no IP, user agent or cookie. Expose it on `cms-api` with the other public
  routes.
- **Build credentials:** the build reads only published content through the
  public REST API, so it needs no admin credentials. If public read access is
  ever closed, give CI a read-only Strapi API token.
- **WAF/rate limits** on `cms-api`: the CMS already rate-limits the assistant
  (20/min/IP) and search analytics (30/min/IP), and every public `POST /api`
  (forms, consent logging) through `src/middlewares/rate-limit.ts`; add a
  proxy limit as a second layer.
- **Health checks:** `GET /_health` (Strapi), `GET /api/assist/status` (`{llm}`),
  the Studio login page; add Docker healthchecks for `strapi` and `webx`
  (only `db` has one today).

## 6. Order of work (when DGA approves hosting)

1. Choose the host and domains **[decide]**; agree what part of WebX is handed
   over (Q-11).
2. Stand up Postgres + Strapi + object storage on the staging network; migrate
   the local SQLite content with `strapi transfer` or a re-seed.
3. Put Studio behind SSO/VPN; set `NEXT_PUBLIC_STUDIO_ORIGIN`.
4. Create the CI job (sections 3 and 4) against staging; prove a publish
   reaches the staging site and a broken page blocks the upload.
5. Load test the public CMS API routes behind the WAF; pen test (TOR งวด 4).
6. Switch DNS for `www` to the static host; keep the previous host for a week.
