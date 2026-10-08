# ORST public website — production deployment requirements

Hand-over document. Audience: the engineer / DevOps owner who will take the
ORST public website from "works on a developer machine" to "live on a real
domain, updating when an editor presses Publish".

Everything described under **Current state** has been built and tested locally.
Everything under **Requirements** is what is still to be done or decided.
Nothing in this document contains credentials; env var *names* only.

---

## 1. Goal

1. The ORST public website is served from its own domain **root**
   (`https://www.orst.go.th/about`, not `.../orst/about`), over HTTPS.
2. An editor who presses **Publish** in WebX Studio sees the live website change
   without anyone running a command (target: under ~2 minutes).
3. The visitor-facing site can be run, moved and restored independently of the
   developer's machine.

---

## 2. System overview

WebX is headless. Content lives in a CMS; a separate program turns it into the
public website.

```
 Editor ──► WebX Studio (:3000)  ── writes content ──►  WordPress (:8081)   ORST / RoyalSociety content
            Next.js admin + BFF                         Strapi    (:1337)   DGA / PEA / NBTC / ThaID content,
                 │                                                        tenant records (brand, theme, nav)
                 │ after Publish: POST /rebuild
                 ▼
          site-builder (:8099, internal)  ── next build ──► static files ─┐
          reads Strapi + WordPress at build time                           │ shared volume `site-out`
                                                                           ▼
 Visitor ───────────────────────────────────────────────────────────►  site (Caddy, :80/:443)
                                                     serves the static files, maps / → /orst/…
 Visitor's browser ──(polls, captcha, search, breaking-news banner)──►  WordPress /wp-json   (cross-origin)
```

| Service (compose) | Port | Role |
|---|---|---|
| `webx` | 3000 | Studio: editors' UI. Never public. |
| `strapi` | 1337 (localhost only) | Backend for the Strapi tenants and for tenant records. |
| `wordpress` (+ `wp-mysql`, `wp-cli`) | 8081 | Content backend for ORST/RoyalSociety. |
| `litellm` | 4000 (localhost only) | LLM gateway for Studio's AI features. |
| `site-builder` | 8099 (not published) | Builds the static site; exposes `POST /rebuild`, `GET /status`. |
| `site` | 80 / 443 | **The public website.** Caddy. |

Key facts an implementer must know:

- The site is a **static export** (`next.config.mjs`: `output: "export"`). Once
  built it needs no Node, Strapi or WordPress to be *served*.
- All pages of all tenants are in one export. ORST's pages are under `/orst`
  (`/orst.html`, `/orst/about.html`, `/en/orst/about.html`); Caddy maps the
  domain root onto them and 301-redirects the prefixed form to the clean URL.
  See `public-site/docker/Caddyfile`.
- `NEXT_PUBLIC_*` variables are **baked into the pages at build time**.
  Changing the domain or the WordPress URL means rebuilding.
- Internal links in the content still read `/orst/...` (plain `<a>` tags, no
  client router), so every click is a normal request that Caddy redirects.

---

## 3. Current state

### Built and tested locally

| Capability | Where | Verified |
|---|---|---|
| Serve ORST from domain root, redirects, EN pages, feed, 404 | `public-site/docker/Caddyfile` | Yes — curl matrix + real browser (Chromium via Playwright), no failed requests or console errors |
| Published URLs without `/orst` (canonical, og:url, hreflang, RSS, llms.txt) | `public-site/lib/seo.ts` `publicPath()`; enabled by `PUBLIC_SITE_ROOT_TENANTS=orst` | Yes — 10 unit tests + browser check |
| Static build in Docker + atomic release swap | `public-site/docker/builder.mjs`, `public-site/Dockerfile.site` | Yes |
| **Publish → live site updates** | `webx-studio/lib/publicSiteBuild.ts` (`PUBLIC_SITE_REBUILD_URL`) → `site-builder` | Yes — pressed Publish in the Visual Builder: `/test` went 404 → 200 in ~63 s; Unpublish took it back to 404 |
| Site-wide theme (colours, fonts, corner radius) | Studio → Branding → **Theme** tab; `public-site/lib/theme.ts` | Yes — saved, appears on site, reset removes it |
| Self-contained deployable image (`webx-orst-site`) | `public-site/scripts/package-standalone.mjs` | Yes — run outside the compose stack, all routes OK |

### Not done / not verified

- **Never run against a real domain.** No DNS, no public TLS, no public WordPress URL.
- Cross-origin calls from the site to WordPress: worked locally
  (`orst.localhost:8090` → `localhost:8081`, no CORS errors) but **must be
  re-verified** with the real two domains. WordPress core's REST CORS handling
  is relied on; there is no custom CORS config in `wordpress/mu-plugins`.
- No monitoring, no alerting, no backup of the built site (it is reproducible
  from content, but see 5.7).
- RoyalSociety is **not** wired for root-domain serving (see 5.9).
- **All of this work is uncommitted** on branch `ktb-dev` (list in §8). Commit
  and push before handing over, or the next person has nothing to build from.

---

## 4. Inputs required before starting

| Input | Example | Why it matters |
|---|---|---|
| Public domain of the site | `www.orst.go.th` | Baked into canonical/OG/RSS URLs; Caddy's TLS name |
| Public WordPress URL, reachable by visitors' browsers | `https://cms.orst.go.th/wp-json` | Baked in as `NEXT_PUBLIC_WORDPRESS_URL`; used for polls, captcha, search, breaking-news |
| Studio's public origin (or internal-only decision) | `https://studio.orst.go.th` | `NEXT_PUBLIC_STUDIO_ORIGIN` — allowed parent of the Visual Builder preview |
| Target host(s) | one VM / separate hosts | Decides §5.1 vs. §5.2 |
| DNS control + ports 80/443 reachable from the internet | — | Caddy obtains a certificate automatically (HTTP-01) |

---

## 5. Requirements

### 5.1 Single-host deployment (recommended first step)

Run Studio, Strapi, WordPress, `site-builder` and `site` on **one** server. This
is the configuration that was tested; Publish → live then works with no extra code.

In `.env` (see `.env.production.example` for the rest):

```
SITE_ADDRESS=www.orst.go.th                       # bare domain => automatic HTTPS
SITE_PUBLIC_URL=https://www.orst.go.th
SITE_WORDPRESS_PUBLIC_URL=https://cms.orst.go.th/wp-json
SITE_STUDIO_ORIGIN=https://studio.orst.go.th
SITE_ROOT_TENANTS=orst
SITE_HTTP_PORT=80
SITE_HTTPS_PORT=443
```

```
docker compose --profile ai --profile wordpress --profile site up -d --build
```

All three profiles are needed: `site` depends on the `wordpress` service.
Studio reaches the builder at `http://site-builder:8099` by default
(`PUBLIC_SITE_REBUILD_URL`) using `STRAPI_INTERNAL_SECRET` as the shared secret
unless `PUBLIC_SITE_REBUILD_SECRET` is set.

### 5.2 Split deployment (Studio and the website on different hosts) — not built

If the website must live on a different server from Studio, the builder has to
**push** its output there (rsync/scp over SSH, or upload to object storage +
CDN) after each successful build. `builder.mjs` currently only writes to a local
volume. Add a post-publish step and a deploy key; keep the "previous release
stays live if the build or the push fails" property.

The packaged image from `public-site/scripts/package-standalone.mjs` is a
**snapshot**, not a live site — it never updates itself. Use it for a fixed
demo or as the artifact a CI job ships, not as the Publish-to-live mechanism.

### 5.3 DNS and TLS

- `www.orst.go.th` A/AAAA record to the host; ports 80 and 443 open inbound.
- Persist Caddy's `/data` volume (`caddy-data` in compose) — losing it forces
  certificate re-issue and can hit Let's Encrypt rate limits.
- If the organisation terminates TLS elsewhere (load balancer / WAF), set
  `SITE_ADDRESS=http://www.orst.go.th` and let that layer own HTTPS.

### 5.4 WordPress must be reachable by visitors — and only the REST API

The public pages call WordPress directly from the browser: `GET /wp/v2/poll`,
`POST /webx/v1/polls/<id>/vote`, the captcha endpoint, site search,
`GET /wp/v2/breaking-news`.

- Publish WordPress under its own hostname (e.g. `cms.orst.go.th`) with TLS.
- Allow **only** `/wp-json/*` from the internet. Block or IP-restrict
  `/wp-admin`, `/wp-login.php`, `xmlrpc.php`.
- Verify CORS from the real site origin for both simple GETs and the vote POST
  (preflight). Also confirm the browser does not block mixed content.
- Remove `WP_ALLOW_HTTP_APP_PASSWORDS=1` from the production `.env` — it exists
  only to allow Application Passwords over plain HTTP in development.

### 5.5 Network exposure

Publish only 80/443 (site) and 443 for WordPress `/wp-json`. Do **not** expose:
Studio `:3000` (put it behind SSO/VPN or at least its own TLS hostname),
Strapi `:1337`, LiteLLM `:4000`, `site-builder :8099`, databases. Studio and
WordPress admin are on `0.0.0.0` in the current compose file; change the port
mappings or firewall them.

### 5.6 Secrets

The current `.env` is a development file. For production: generate every secret
fresh (`.env.production.example` and `DEPLOY.md` have the recipe), change the
seeded editor passwords (`DGA_EDITOR_PASSWORD`, `PEA_EDITOR_PASSWORD`), the
WordPress admin and scheduler credentials, the ORST editor's Application
Password, and `LITELLM_MASTER_KEY`. Never commit `.env`.

### 5.7 Reliability and operations

- **Rebuild latency** ~60 s plus a 5 s debounce; bursts collapse into one build
  and never overlap (`builder.mjs`). Decide whether that is acceptable.
- A failed build leaves the previous release live (atomic symlink swap, three
  releases kept). Add alerting on `GET /status` → `lastError`. Studio's Status
  page already shows build state.
- Back up: Postgres (`db-backup` service exists), WordPress MySQL + uploads
  (`wp-db-backup`), and the `caddy-data` volume.
- Healthcheck/uptime monitor on `https://www.orst.go.th/` and on
  `/feed.xml`.
- Add a cold-start rule: if `site-out` is empty (new host), `site-builder`
  builds on first start — the site returns errors until that finishes (~1–2 min).

### 5.8 Content and SEO

- Absolute URLs come from `SITE_PUBLIC_URL`. After going live, check
  `<link rel="canonical">`, `og:url`, hreflang, `/feed.xml`, `/llms.txt`.
- `robots.txt` and a sitemap do not exist in `public-site` today. Add them if
  required by the TOR.
- Page *content* may contain absolute `/orst/...` links; they work through
  Caddy's redirect but cost an extra hop. Optional clean-up: rewrite them at
  build time.

### 5.9 Other tenants (RoyalSociety, DGA, PEA)

The Caddyfile is written for ORST only (hard-coded `/orst` mapping), and
`SITE_ROOT_TENANTS` only affects URL generation. To serve RoyalSociety from its
own domain, add a second Caddy site block with `/royalsociety` in place of
`/orst`, and add it to `PUBLIC_SITE_ROOT_TENANTS` (comma-separated) with its own
`PUBLIC_SITE_URL_ROYALSOCIETY`. The URL-rewriting helper already supports
several tenants. DGA/PEA use the `gov-portal` template and a different layout.

---

## 6. Acceptance tests

Replace the host with the real one. Expected results in brackets.

```
curl -sI https://www.orst.go.th/            # [200, valid certificate]
curl -sI https://www.orst.go.th/about       # [200]
curl -sI https://www.orst.go.th/en          # [200]
curl -sI https://www.orst.go.th/orst/about  # [301 -> https://www.orst.go.th/about]
curl -sI "https://www.orst.go.th/orst/search?q=x"   # [301, query string kept]
curl -sI https://www.orst.go.th/no-such     # [404, not 200]
curl -s  https://www.orst.go.th/ | grep -o 'og:url" content="[^"]*"'   # [https://www.orst.go.th, no /orst]
curl -sI https://www.orst.go.th/feed.xml    # [200, RSS]
curl -sI https://www.orst.go.th/wp-admin/   # [not reachable on the site host]
curl -sI https://cms.orst.go.th/wp-admin/   # [blocked/restricted]
```

Browser (DevTools console + network): home page loads fonts and CSS, **no failed
requests, no CORS or mixed-content errors**, a poll vote succeeds, the captcha
loads, the search box returns results.

**Publish → live (the main acceptance test):**
1. In Studio open Visual Builder (ORST), change some visible text, press Publish.
2. Studio says "Published — live on the site."
3. Within ~2 minutes the change is visible on the public domain.
4. `site-builder` log shows `build started` then `build published`.
5. Unpublish the page; it disappears within ~2 minutes.
6. Break the build on purpose (e.g. stop WordPress, Publish): the old site stays
   up and `GET /status` reports `lastError`.

---

## 7. Known issues and risks

| # | Item | Impact |
|---|---|---|
| 1 | The AI model account (Moonshot / Kimi, `LITELLM_MODEL=webx-kimi`) was suspended for insufficient balance during testing | Studio's Agent and AI features return "Paused — the AI service is busy or unreachable". Top up, or point `LITELLM_MODEL` at another configured provider. Embeddings (a different provider) were not affected. |
| 2 | Studio → Branding → **Appearance** tab returns 403 for a WordPress-engine session (`/api/strapi/api/console/*` rejects the WordPress token) | Pre-existing. The new **Theme** tab avoids it (uses the governed `api::tenant.tenant` route). |
| 3 | `NEXT_PUBLIC_*` values are build-time | Wrong domain/WP URL ⇒ must rebuild. A packaged bundle built with the local defaults must not be shipped. |
| 4 | Next.js caches fetched data in `.next/cache` across builds | `builder.mjs` deletes it before each build. Do not remove that line or edits will appear not to publish. |
| 5 | AI index/search/audit read Strapi content types only | They return nothing for ORST (WordPress). By design today. |
| 6 | Windows shells mangle non-ASCII in `curl -d` (Thai became `?`) | One ORST record was corrupted and restored during testing. Send Thai through a UTF-8 file or Node, never a command-line string. |
| 7 | Fonts are self-hosted: only IBM Plex Sans Thai and Noto Serif Thai (+ 2 system stacks) are selectable in the Theme tab | Adding a font = add the files via `public-site/scripts/fetch-fonts.mjs` and the option lists in `public-site/lib/theme.ts` and `webx-studio/lib/theme.ts` (kept in sync by hand). |
| 8 | Site-wide theme only applies to ORST and RoyalSociety | Other tenants' Theme tab shows "not supported". |

---

## 8. What changed in the repository (uncommitted on `ktb-dev`)

New:
- `public-site/docker/Caddyfile`, `public-site/docker/builder.mjs`
- `public-site/Dockerfile.site`, `public-site/.dockerignore`
- `public-site/scripts/package-standalone.mjs`
- `public-site/lib/theme.ts` (+ `theme.test.ts`), `public-site/lib/seo.test.ts`
- `webx-studio/components/ThemeSettings.tsx`, `webx-studio/lib/theme.ts`,
  `webx-studio/tests/theme.test.ts`

Modified:
- `docker-compose.yml` — services `site-builder`, `site`; volumes `site-out`,
  `caddy-data`; `webx` gets `PUBLIC_SITE_REBUILD_URL` / `_SECRET`
- `public-site/lib/seo.ts` (`publicPath`), `lib/rss.ts`, `lib/cms.ts`
  (`getThemeCss`), `app/llms.txt/route.ts`, `app/orst/layout.tsx`,
  `app/royalsociety/layout.tsx`, `.gitignore`
- `webx-studio/lib/publicSiteBuild.ts` — remote rebuild; `getPublicSiteBuildStatus`
  is now async
- `webx-studio/components/Branding.tsx`, `webx-studio/lib/i18n.ts` — Theme tab

Tests: `cd public-site && npm test` (101 pass), `cd webx-studio && npm test`
(329 pass). `tsc --noEmit` is clean apart from three existing `leaflet` image
typing errors in `webx-studio/components/blockPreview/LocationMapPreview.tsx`.

---

## 9. Useful commands

```
# build status of the live site
docker compose --profile ai --profile wordpress --profile site exec site-builder \
  node -e "fetch('http://localhost:8099/status').then(r=>r.text()).then(console.log)"

# force a rebuild (what Publish does) — answers 202; 403 means the secret is wrong
docker compose --profile ai --profile wordpress --profile site exec site-builder \
  node -e "fetch('http://localhost:8099/rebuild',{method:'POST',headers:{'x-rebuild-secret':process.env.PUBLIC_SITE_REBUILD_SECRET}}).then(r=>console.log(r.status))"

# watch it build
docker compose --profile ai --profile wordpress --profile site logs -f site-builder

# package a fixed snapshot for a real domain (needs the stack running)
node public-site/scripts/package-standalone.mjs \
  --url https://www.orst.go.th --wp https://cms.orst.go.th/wp-json --save
```

Local trial (no DNS, no TLS): `http://orst.localhost:8090` — Chrome and Firefox
resolve `*.localhost` to the machine itself.

Further reading in this repo: `DEPLOY.md` (production checklist, WordPress
mu-plugin deployment, Stripe), `docs/TECHNICAL.md`, `public-site/.env.example`.
