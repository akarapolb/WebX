# webx-control

The WebX control plane (`../docs/target-architecture.md`, decision D2). It owns
what is about the organisations rather than their content, so that the content
engines (Rust, Strapi, WordPress) keep only content. Built so far, each part
switched on by Studio, Strapi or the public site when a deployment is ready:

- the **tenant registry** and its public routes (C2);
- the **audit log**, **bookkeeping records** (page templates and versions, the agent's threads, reviews and releases) and the **job queue and schedules** the
  agent workers lease from (C3, C5);
- **users, memberships and signed tokens** with a published key (C4, started: Studio's sign-in does not use them yet);
- the **visitors' routes** (C5): cookie consent, search statistics, captcha, the four form inboxes with personal data and files
  encrypted at rest and mail sent over SMTP, and the site assistant.

One small Rust binary (axum; SQLite compiled into it; rustls for mail and model calls).

```sh
cargo build --release

# fill the registry once from a snapshot (what Strapi answered for the tenant routes)
target/release/webx-control import --snapshot ../rust-engine/snapshot/snapshot.json --db control.db

WEBX_CONTROL_ADMIN_TOKEN=<secret> target/release/webx-control --db control.db --port 1400
```

## Public routes (no auth)

These are the routes public-site reads at build time, answered exactly as
Strapi answers them:

| Route | Answer |
|---|---|
| `GET /api/tenants/keys` | `{data: [{key, engine, publicTemplate}]}`, in the order the tenants were created |
| `GET /api/tenants/resolve?tenant=<key>` | `{data: {key, name, brand, contact, social, footerColumns, ...}}` |

A request that names no tenant gets the first one created. An unknown key gets
the first tenant's answer too, which is what Strapi and every engine do today
(`../docs/engine-contract.md` section 2) and what public-site's builds rely on
(its `/dgahub/...` routes ask for a tenant this registry may not list). Start
with `--strict-tenants` for decision D9: an unknown key is then a **404**, never
another tenant's data. D9 becomes the default once every engine and the build
agree. Point a public-site build at it with `WEBX_CONTROL_URL=http://host:1400`;
without that variable public-site reads the tenant routes from the content
engine as before. The browser's own tenant lookup (`useTenantContact`) follows
public-site's `PUBLIC_CONTROL_URL` when that is set (it is a visitors' route, below), and the CMS address until then.

## Configuration

Flags: `--db control.db` (the SQLite file), `--port 1400`, `--host 127.0.0.1` (the address it listens on: loopback unless told
otherwise, so give `0.0.0.0` in a container or when a proxy on another host reaches it), `--strict-tenants` (decision D9),
`--token-ttl 900` (seconds a signed-in user's token lives). Everything else is an environment variable:

| Variable | What it does | Without it |
|---|---|---|
| `WEBX_CONTROL_SERVICE_TOKEN` | the bearer token of `/internal/*`: Studio, Strapi's dashboards, the workers and the migration tools | the internal API is off (503) |
| `WEBX_CONTROL_ADMIN_TOKEN` | the bearer token of `/admin/*` (tenants, users) | the admin API is off (503) |
| `WEBX_CONTROL_SIGNING_KEY` | base64 of 32 bytes: the key sign-in tokens are signed with | one is made and kept in the database |
| `WEBX_PII_KEY` | base64 of 32 bytes, the **same value as Strapi's `PII_ENCRYPTION_KEY`**: personal data and files are encrypted with it | the form routes and form collections answer 503 |
| `WEBX_PUBLIC_SITE_ORIGINS` | comma-separated origins of the public sites (or `*`) allowed to call the visitors' routes from a browser | only the local development origins |
| `WEBX_TRUSTED_PROXIES` | how many reverse proxies of yours stand in front: the per-address limits use the `X-Forwarded-For` entry the outermost of them added (that many places from the right), never an entry to its left, which the caller writes. `0` when the service is reachable directly: the header is ignored and the connecting address counts | `1` |
| `WEBX_CAPTCHA` | `off` turns the form captcha off (development only) | the captcha is asked |
| `WEBX_SMTP_URL`, `WEBX_MAIL_FROM` | the mail server and sender for the forms' mail | mail is queued and kept, not sent |
| `WEBX_COMPLAINT_NOTIFY_EMAIL` | where a new complaint is reported | staff are not mailed |
| `WEBX_ENGINE_URL` | where the site assistant reads a Strapi workspace's content (a workspace's own `engineUrl` wins) | `http://localhost:1337` |
| `LITELLM_URL`, `LITELLM_KEY`, `LITELLM_MODEL`, `LITELLM_ASK_MODEL`, `LITELLM_TIMEOUT_MS` | the model behind the site assistant | the assistant quotes the best passage |

Run it in Docker with `docker compose --profile control up -d --build` (the `webx-control` service in `../docker-compose.yml`, an image built
from `./Dockerfile`, the database on the `control-data` volume). Put it behind the reverse proxy that serves the public sites:
the per-address limits key on the `X-Forwarded-For` entry that proxy adds (`WEBX_TRUSTED_PROXIES`). The database is one SQLite file: back it up by copying it while the
service is stopped, or with `sqlite3 control.db ".backup copy.db"`.

## Visitors' routes (C5, decision D12)

What a visitor's browser calls without signing in. Anonymous, rate-limited per address, write-only.

| Route | Meaning |
|---|---|
| `POST /api/consent-logs?tenant=<key>` body `{data: {consentId, action, categories, language, path, userAgent}}` | log a cookie choice (PDPA evidence); `201 {data: {documentId, createdAt}}` |
| `POST /api/search-stats/log?tenant=<key>` body `{q, locale, results}` | count one search on the public site, anonymously; `204` whether or not it was kept |
| `GET /api/captcha` | `{data: {id, question}}`: a sum such as `3 + 4 = ?` for a form to ask; the answer is never sent |
| `POST /api/assist/ask?tenant=<key>` body `{q, locale}` | the site assistant: `{answer, mode, sources, cited}` |
| `GET /api/assist/status`; `POST /api/assist/simplify`, `/api/assist/translate`, `/api/assist/find` | whether answers are generated (`{llm}`); the model's rewrite in plain Thai, a translation, and the service finder |
| `POST /api/complaints`, `/api/applications`, `/api/registrations`, `/api/contact-messages` `?tenant=<key>` body `{data: {...}, captchaId, captchaAnswer}` | a visitor's form; `201 {data: {documentId, createdAt, ref}}` (`username` for a registration, neither for a contact message) |
| `POST /api/complaints/submit`, `/api/applications/submit` `?tenant=<key>` multipart: `data` (JSON text), `files.attachment` / `files.resume`, `captchaId`, `captchaAnswer` | the same form with a file attached; `201` as above |
| `GET /api/complaints/track/<ref>?tenant=<key>`, `GET /api/applications/track/<ref>?tenant=<key>` | where a submission stands: `{data: {ref, type, subject, date, stage, steps}}` (an application: `ref, jobId, position, date, stage`); 404 for an unknown reference or another workspace's |

The choice is stored as given in the `consent-log` records collection, stamped with the workspace; text is cut at its limit
(`path` and `userAgent` at 512 characters), unknown fields are dropped, `categories` must be an object of at most 2 KB, an
`action` is required, and a body past 16 KB is refused (413). A tenant that is not registered is filed under the first one, as
Strapi does, or refused (404) with `--strict-tenants`. One address may log 30 times a minute (429 after that). The address is the
one your own proxy added to `X-Forwarded-For` (the last entry when one proxy stands in front; see `WEBX_TRUSTED_PROXIES`), else the
connecting address; an entry the caller wrote to its left is never believed, and an IPv6 address counts as its /64.
**Search statistics** (a port of `strapi-cms/src/api/search-stat`): one row per workspace, language and normalised query, with
`count`, the last `results`, `zeroCount` (how often it found nothing) and `lastAt`; never who searched. The query is trimmed,
single-spaced, lower-cased and cut at 100 characters; an empty one, one with an e-mail address in it, or one with a number of
9 or more digits (a phone, national ID or account number; a list of 4-digit years such as `2566-2570` is fine) is **dropped
without being stored, with the same 204**, so a caller cannot probe what was kept. `locale` is `en` or else `th`; `results` is
clamped to 0..10000. A workspace keeps at most 20,000 different queries (a new one past that is dropped; known ones still
count), a body past 4 KB is refused (413), and an address may search 30 times a minute (its own allowance, apart from the
consent log's). Read with `GET /internal/records/search-stat?filter=tenantKey:eq:<key>&sort=count:DESC&pageSize=500` (service
token; filters `tenantKey` and `locale` eq, `query` contains; sorts `count` `results` `zeroCount` `lastAt` `query` `createdAt`),
which is read-only here. Studio's search insights add these counts to the engine's per query
(`webx-studio/lib/cms/stat-merge.ts`, the top 1000 queries of each); one Unicode step of Strapi's normaliser (NFC) is not applied.

**The assistant** (a port of `strapi-cms/src/api/assist` and its retrieval and answer rules: `assist.rs`, `llm.rs`). `ask` answers a visitor's
question (at most 400 characters; `locale` `en` or else `th`) **only from the workspace's own published content**: its pages (each
block, and each tab or accordion panel as a passage of its own), services, FAQs, articles and datasets, read from the workspace's
content engine through the same read API public-site's build uses (`<engine>/api/pages?populate[blocks][populate]=*&tenant=<key>&locale=…`,
`services`, `faqs`, `articles`, `datasets`, 100 each), at the registry's `engineUrl` or `WEBX_ENGINE_URL` (default
`http://localhost:1337`); a WordPress workspace has no read API of that shape, so nothing to answer from. The corpus is kept for a
minute per workspace and language, and an engine that does not answer gives no answer (`mode: "none"`) and is asked again at once
next time. Retrieval is small and lexical (Latin words, Thai character bigrams, question words dropped, a BM25-like score, the
document whose title is the question first). **The answer always lists its sources** (`{n, kind, title, url}`, the url being where on the
site the passage is shown). With a model (`LITELLM_URL`, `LITELLM_KEY`, `LITELLM_ASK_MODEL`/`LITELLM_MODEL`, `LITELLM_TIMEOUT_MS`, the same
settings as Strapi's) it may use only the numbered sources and cites them as `[1]`, `[2]`; a citation to a number that does not exist is
removed (`mode: "llm"`). With no model, or when it fails, times out or says nothing, the answer **quotes the best passage** and never
generates text of its own (`mode: "extractive"`); nothing found is `mode: "none"` with no sources, and the model is not called.
`simplify`, `translate` and `find` need the model (503 `AI not configured` without it; 502 `AI error` when it fails). All of them
share an allowance of **20 a minute per address** (429). `find` answers from the workspace's services and FAQs and returns the first six
services with their slugs. Test: `node tools/assist-test.mjs` (a fake engine and a fake LiteLLM).

**Forms** (decisions D6 and D12; a port of Strapi's complaint, application, registration and contact-message types, same fields
and rules). A post is rate-limited (30 a minute per address, its own allowance), checked against the captcha (a 400 named
`CaptchaError`, the name the public site looks for; `WEBX_CAPTCHA=off` turns it off for development), then cut to the fields the
form has (text at its limit, e-mail checked, `extra` an object of at most 4 KB, a body past 64 KB refused) and stored under the
workspace in the URL (an unregistered one is filed under the first, or refused with `--strict-tenants`). **What the server owns
cannot be set by a visitor:** a complaint's or application's `stage` (always 0) and `steps`, its reference `DGA-CMP-<Buddhist year>-<6
digits>` (an application's `DGA-JOB-...`), a registration's `verified` (always false) and `username` (made from the e-mail's local
part and 4 digits; a password is never stored), a contact message's `handled`. An anonymous complaint is stored with no name, e-mail
or phone. A reference is unique in its collection (a taken random one is retried), and tracking finds it by that alone, inside the
workspace named, answering only the fields shown above and never personal data; it has its own allowance (30 a minute), since a
reference is six digits.

**Personal data is encrypted at rest** (PDPA): a complaint's, application's and contact message's `name`, `email`, `phone`, a
registration's `email`, `firstname`, `lastname`, `phone`. AES-256-GCM in Strapi's format (`iv.ciphertext.tag`, base64), under
`WEBX_PII_KEY` (base64 of 32 bytes). **Give it the same value as Strapi's `PII_ENCRYPTION_KEY`** and a row moved from Strapi needs no
re-encryption (checked against values made by Strapi's Node code). Without the key the form routes and the form collections of the
records API answer 503, so personal data is never stored or read in the clear. Two differences from Strapi, on purpose: what a
visitor or an editor sends is *always* encrypted (Strapi skipped a value that merely looked encrypted, so a name like
`AAAA.AAAA.AAAA` was stored in the clear and broke every later read of the list), and a value that cannot be decrypted is a 500
`PiiError` naming the field, never an empty string. Only an import keeps a value that really decrypts under the key. The reading
side is Studio's records API (`/internal/records/complaint`, `application`, `registration`, `contact-message`; service token): rows
come back decrypted, a create gets the same reference, stage and username a visitor's post gets, an update re-encrypts what it
changes, and a filter on a personal-data field is a 400 (it would compare ciphertext).

**Attachments** (decision D14, default: kept in this service's own database; an object store can replace it later). The multipart
routes take one file per form, as `files.attachment` (complaint) or `files.resume` (application); a file in any other field is
ignored. It must be at most **5 MB** (a body past 6 MB is refused outright, 413), a **document or an image** (pdf, png, jpg, gif,
webp, doc/docx, xls/xlsx, ppt/pptx, odt/ods/odp, rtf, txt, csv) **whose first bytes match its extension** (a program renamed `.pdf`
is refused; so are html, svg, exe and anything not listed), and not empty: Strapi took anything. The name is cleaned (no path, no
quotes or control characters, 120 characters at most, Thai kept) and the type it is served as is the one the extension gives, never
the client's claim. The bytes are **encrypted at rest** with the same key as the form fields (`iv || ciphertext || tag`), because an
attachment is personal data too. The row keeps `attachment` or `resume` as `{documentId, name, mime, size}`. Only Studio reads the
file, through the internal API with the service token: `GET /internal/files/<documentId>` answers it whole as an attachment with
`X-Content-Type-Options: nosniff` and `Cache-Control: no-store` (never inline); `POST /internal/files?name=<name>&tenant=<key>` (the
body is the file; no type check, for a migration) and `DELETE /internal/files/<documentId>` complete it. Deleting a complaint or an
application through the records API deletes its file.

**Mail** (decision D15; the texts and the cases are the ones Strapi's lifecycles had). A new complaint tells staff (to
`WEBX_COMPLAINT_NOTIFY_EMAIL`, when set) and, unless it is anonymous or has no address, acknowledges the citizen; a new application and a
new registration confirm to their address; a contact message sends nothing. The mail is written to an **outbox first**, so a slow or
absent mail server never delays or fails a visitor's submission, and sent by a loop in the background every couple of seconds. While it
waits, its recipient, subject and text are **encrypted**; once it is sent they are **wiped** (the kind, workspace and times stay). A
mail the server refuses is counted and tried again after a wait that doubles from a minute to an hour; after 8 tries it is given up on and
dropped a week later. Set the server with `WEBX_SMTP_URL` (`smtps://user:pass@host:465` for TLS from the first byte,
`smtp://user:pass@host:587?tls=required` for STARTTLS, `smtp://relay.internal:25` for a plain internal relay; TLS is rustls) and the sender
with `WEBX_MAIL_FROM` (`"สพร. <no-reply@dga.or.th>"`). With no server set mail is queued and kept, and sent once one is. `GET
/internal/outbox[?tenant=<key>]` shows the counts (total, sent, pending, failed) and the recent rows (kind, workspace, times, attempts,
last error), never an address or a text.

**Captcha** (a port of `strapi-cms/src/utils/captcha.ts`): `GET /api/captcha` makes a sum of two digits, keeps its answer here and
sends only an `id` and the question. The form routes take `captchaId` and `captchaAnswer` in the body and check them
here: one try per challenge (a wrong answer uses it up), five minutes to answer, at most 20,000 open at once (503 past that), and an
address may ask for 30 a minute (its own allowance). Challenges are held in memory, so a restart makes the open ones fail, as in Strapi.

**CORS.** The public site is on another origin than this service, so a JSON post is preflighted and the answer has to name
that origin. Every `/api/*` route a browser calls (these and the tenant lookups; not `/api/auth/*`, `/internal` or `/admin`)
answers `OPTIONS` with 204 and sends `Access-Control-Allow-Origin` for an allowed origin: the local development ones Strapi
allows (`http://localhost:3100`, `:8080`, `:8095`, `http://127.0.0.1:8080`) and the comma-separated
`WEBX_PUBLIC_SITE_ORIGINS` (a trailing slash is ignored; `*` allows any origin, safe here since these routes are anonymous and
take no cookies). Any other origin gets no permission, so its browser blocks the post. Set it to the public sites' own
addresses, the same variable Strapi's CORS reads.

**Reading the log back** (service token):

| Route | Meaning |
|---|---|
| `GET /internal/records/consent-log?filter=tenantKey:eq:<key>&sort=createdAt:DESC` | list, as any records collection |
| `GET /internal/consent/summary?tenant=<key>&from=<iso>&before=<iso>` | `{data: {total, accept, reject, custom}}` for one workspace (no `tenant`: all) and a creation window, from inclusive, before exclusive; counted as Strapi's analytics counts (an action containing `accept`, or `all`/`opt-in`, is an accept; containing `reject`, or `none`/`opt-out`, a reject; the rest custom) |

**Switching over.** Nothing is copied. Point public-site at this service with `PUBLIC_CONTROL_URL=https://control.example.go.th`
(its cookie banner, search reporter, forms with their captcha, site assistant, and the contact lookup then call here; unset, they call
the CMS as before) and give Strapi and Studio the same
`WEBX_CONTROL_URL` and `WEBX_CONTROL_SERVICE_TOKEN` they use for the audit log. Then **Studio's Cookie Consent page lists the
choices from both places** (`webx-studio/lib/cms/consent-merge.ts`: the control plane's and Strapi's, newest first, scoped to the
workspace; a page may reach 1000 rows deep) and **Strapi's analytics dashboard and monthly report add this service's counts to
its own** and read the audit log from here (`strapi-cms/src/utils/control-plane.ts`; an unreachable control plane is logged and
left out). Old evidence therefore stays where it was and stays visible, and the public site can be switched at any moment. Studio
cannot edit or delete a choice held here. Strapi's own copy of the table goes in C6, after an import (`records import` keeps the
ids) and with the dual read turned off, or the migrated rows would be counted twice.

**Studio and Strapi's dashboards read the forms from here too, next to the engine's own** (nothing is copied, so the public site can be
switched at any moment, as for the consent log): Studio's Forms inbox and the generic content screens list the submissions of both
places as one (`webx-studio/lib/cms/form-merge.ts`), scoped to the editor's workspace by its key, with the personal data readable; a
submission is read, changed and deleted where it lives, and an editor can change what an editor may (a stage, steps, notes) but not
its reference, workspace or file. A file is shown with a `url` Studio serves (`/api/cms/forms-file/<id>`) after checking the
editor's workspace and their role's permission to see that form; it is always a download. Strapi's analytics adds the counts here
(`GET /internal/forms/summary?tenant=<key>&from=<iso>&before=<iso>`: `{data: {complaint, application, registration, contact-message}}`;
no key needed, since no personal data is read) to its own, in the dashboard and in the monthly report. Studio's switch is the same
two variables as the audit log (`WEBX_CONTROL_URL`, `WEBX_CONTROL_SERVICE_TOKEN`).

**Moving the old submissions** is optional (Studio and the dashboards read both places) and is for the day Strapi's copy is retired (C6):

```
STRAPI_URL=... STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... WEBX_CONTROL_URL=... WEBX_CONTROL_SERVICE_TOKEN=... \
  node tools/migrate-forms.mjs [--dry-run] [--move] [--default-tenant <key>]
```

It copies each form's rows with their id, reference number, stage, steps and times, asks Strapi for the rows of each tenant to know a row's
workspace (a row with no tenant is reported, and filed under `--default-tenant` if given), downloads each complaint attachment and
application résumé from Strapi's uploads and stores it here (encrypted), and skips what is already here, so it can be run again.
Strapi hands over the personal data decrypted and this service encrypts it again (a value already ciphertext under the key is kept).
`--dry-run` writes nothing; `--move` deletes each row from Strapi once it is verified here (without it a migrated row would be listed
twice by Studio until Strapi's copy is deleted). `node tools/migrate-forms-test.mjs` runs it against the real binary and a fake Strapi.

Not here yet: the WordPress-native forms (decision D6). Strapi's own `console/export` still reads only Strapi's table.

## Admin API

`Authorization: Bearer <WEBX_CONTROL_ADMIN_TOKEN>`; without that variable the
admin API is off (503). Only a hash of the token is held in memory.

| Call | Meaning |
|---|---|
| `GET /admin/tenants`, `GET /admin/tenants/<key>` | the registry, with each tenant's `engineUrl` |
| `PUT /admin/tenants/<key>` body `{engine, publicTemplate, engineUrl?, resolve?}` | create (201) or replace (200); `engine` is `strapi`, `wordpress` or `rust`; `key` is 2 to 32 characters of `a-z 0-9 -` |
| `DELETE /admin/tenants/<key>` | remove |

`GET /_health` reports `served`, the number of public tenant requests answered,
so a test can tell the service was really used.

## Audit log (C3, first part)

The audit trail (who did what in which workspace, when; also the agent's run
and token counts that the plan limits read) is stored here, append-only, in
the shape of Strapi's `audit-log` rows. It is behind a service token:
`WEBX_CONTROL_SERVICE_TOKEN` (the `/internal` API is off without it; the admin
token does not open it).

| Call | Meaning |
|---|---|
| `POST /internal/audit` body `{data: {action, tenantKey, adminEmail, ...}}` | append a row (`action` required) |
| `GET /internal/audit?filter=field:op:value&q=&sort=at:desc&page=&pageSize=` | list; ops `eq ne contains gte lte`; fields are the row's; `pageSize` up to 500 |
| `GET /internal/audit/<documentId>` | one row |
| `POST /internal/audit/import` body `[row, ...]` | migration: rows keep their `documentId` and times; ones already there are skipped |

There is no update or delete. **Studio** (`webx-studio/lib/cms/audit-store.ts`)
switches every audit read and write to this when `WEBX_CONTROL_URL` and
`WEBX_CONTROL_SERVICE_TOKEN` are both set; its tenant scoping, the Audit Log
screen and the monthly agent limits work unchanged. Until then audit stays in
Strapi. To move the history first:

```sh
STRAPI_URL=... STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... WEBX_CONTROL_URL=... WEBX_CONTROL_SERVICE_TOKEN=...   node tools/migrate-audit.mjs [--dry-run]
```

`node tools/audit-test.mjs` checks the API on the real binary and runs Studio's
adapter tests against it. The other bookkeeping types (custom roles, menu items, the tenant rows and so on)
are still in Strapi, except those under Records below.

## Records (C3, second part)

Page templates, page versions, the agent's threads, reviews and releases are stored here as JSON documents, one
`records` table keyed by collection, behind the same service token:

| Call | Meaning |
|---|---|
| `POST /internal/records/<collection>` body `{data}` | create; the id is chosen here |
| `GET /internal/records/<collection>?filter=field:op:value&sort=field:dir&page=&pageSize=` | list; ops `eq ne contains gte lte`; fields are the record's own (no relation paths) |
| `GET`, `PUT` (merge, `null` clears), `DELETE /internal/records/<collection>/<documentId>` | one record |
| `POST /internal/records/<collection>/import` body `[record, ...]` | migration: records keep their `documentId` and times; ones already there are skipped |

`COLLECTIONS` in `src/records.rs` lists what exists: `custom-role`, `page-template`, `page-version`, `agent-thread`, `review`, `release`, and the visitors' `consent-log` and
the four form inboxes (above).
**Studio** (`webx-studio/lib/cms/records-store.ts`) uses it for page templates, page
versions, the agent's threads (owner-scoped conversation history, with the engine's resumable checkpoint), reviews and releases with the same two variables as audit.
A review or a release names its workspace by `tenantKey` here, where Strapi's carries a `tenant` relation: Studio lists them by it, stamps it on every write
(so a caller's update can never move a row to another workspace), refuses a read or write of another workspace's row, lets the publish gate look up an
entry's review in its own workspace, and has the release scheduler read the due releases from here and publish their items as the workspace that made the release
(an item that is another workspace's is refused). Custom roles can be stored here but Studio does
**not** use that yet: Strapi's own enforcement and the WordPress mu-plugin read them from
Strapi, so they move once that lookup is served from here. To move the existing templates, threads, reviews and releases first:

```sh
STRAPI_URL=... STRAPI_ADMIN_EMAIL=... STRAPI_ADMIN_PASSWORD=... WEBX_CONTROL_URL=... WEBX_CONTROL_SERVICE_TOKEN=...   node tools/migrate-records.mjs [--dry-run] [--default-tenant <key>]
```

Run it before switching: a shared template (no workspace) that is only in Strapi is invisible once Studio reads here, and so is an
existing thread (it would show as an empty list of conversations), review (a pending approval would vanish from the board and stop
holding back its entry's publish) or release (a scheduled one would never run). A review or release gets its workspace's key by the tool asking Strapi for each
workspace's rows (`/api/tenants/keys`); one no workspace reaches (made before rows were stamped) is reported and left in Strapi, or filed under `--default-tenant`.
`node tools/migrate-records-test.mjs` runs it against the real binary and a fake Strapi.

## Identity (C4, first part)

Decisions D10 and D11. webx-control holds **users** and their **memberships** (workspace and role) and issues the
**tokens** that prove them. It stores no passwords: people sign in at an OIDC provider (Studio does the OIDC step
today), and Studio then asks for a token here.

| Call | Meaning |
|---|---|
| `PUT /admin/users/<email>` body `{name?, disabled?, superAdmin?, memberships: [{tenantKey, role}]}` | create (201) or replace (200); email is kept lowercase; `superAdmin` marks a user tied to no workspace (Studio's unscoped admin), who may be issued a token for any workspace |
| `GET /admin/users`, `GET`, `DELETE /admin/users/<email>` | the users |
| `POST /internal/token` body `{email, tenantKey?}` (service token) | a signed token for a known, enabled user; with `tenantKey` only for that workspace, which they must belong to; 403 otherwise |
| `GET /.well-known/jwks.json` | the public key (Ed25519) engines and Studio verify tokens with |
| `GET /api/auth/me` with `Authorization: Bearer <token>` | who the token is for; 401 if it is bad, expired, or the user was disabled or deleted |

A token is a JWT signed with EdDSA: `iss` `webx-control`, `sub` the email, `tenants` `[{key, role}]`, `exp`. It lives
15 minutes (`--token-ttl <seconds>`). Disabling a user cuts them off at once at `/api/auth/me`; an engine that checks
only the signature honours a token until it expires, so engines that need instant revocation call `/api/auth/me`.
The signing key is made on first start and kept in the database; set `WEBX_CONTROL_SIGNING_KEY` (base64, 32 bytes)
to use your own, for example one shared by several instances. `node tools/identity-test.mjs` checks all of this on
the real binary, verifying the tokens with Node's own crypto and the published key. `node tools/migrate-users.mjs [--dry-run]` copies Strapi's admin users (name, active flag, workspaces from each
tenant's `adminEmails`, role as a slug; a super admin on no tenant becomes `superAdmin`) with their admin API; its mapping
is unit-tested (`node --test tools/users-map.test.mjs`). Not done yet, and the larger part of C4: Studio's session
trusting these tokens instead of Strapi's (with engines called by a service credential plus the acting editor), the
OIDC provider settings per workspace, MFA here, engines verifying tokens, custom-role assignments in the migration,
and the security review D10 and the plan require before it ships.

## Job queue (C5)

The assistant's background jobs, leased to workers in slices (decision D13). The rules are a port of the ones Studio's
workers use against Strapi (`strapi-cms/src/api/internal/controllers/agent-jobs.ts`), so the Rust worker
(`../webx-agent`) and the Node worker behave alike. All behind the service token.

| Call | Meaning |
|---|---|
| `POST /internal/jobs` body `{data: {tenantKey, ownerEmail, goal, ...}}` | queue a job (always `queued`; `notBefore` and `priority` allowed; other fields are kept) |
| `GET /internal/jobs?tenantKey=&ownerEmail=&runState=&page=&pageSize=`, `GET /internal/jobs/<documentId>` | list (newest first) and read |
| `POST /internal/jobs/claim` `{workerId, limit, caps, defaultCap}` | lease up to `limit` runnable jobs; `caps` is each workspace's running-job limit; one running job per owner |
| `POST /internal/jobs/heartbeat` `{documentId, leaseToken}` | extend the lease; answers `{ok, cancelRequested, pauseRequested}`; `ok: false` means the lease is gone |
| `POST /internal/jobs/checkpoint` `{documentId, leaseToken, checkpoint, checkpointSeq, eventSeq, progress, tokensUsed, events}` | save the run under the lease (also extends it); the newest 200 events are kept |
| `POST /internal/jobs/finish` `{documentId, leaseToken, runState, ...}` | end a slice as `queued`, `paused`, `done`, `failed` or `cancelled`; releases the lease |
| `POST /internal/jobs/control` `{documentId, action, answer?}` | a user's `cancel`, `pause`, `resume` or `answer`: a queued or paused job changes state, a running one gets a flag its worker hears at the next heartbeat |

A lease lasts 90 s. A worker that stops heartbeating loses it: the next claim requeues the job with backoff (30 s, doubling), or
pauses it when it crashed twice with no progress between (`stuck_crash`), or fails it after 5 attempts (`worker_lost`). The clock is
this service's, so workers' clocks do not matter. `node tools/jobs-test.mjs` checks it on the real binary, including two workers
claiming at the same moment and a restart in the middle of a job.

### Schedules

Recurring jobs, the store Studio's tick works against (port of `agent-schedules.ts`; working out the next run stays in Studio, which sends it as `nextRunAt`). Service token.

| Call | Meaning |
|---|---|
| `POST /internal/schedules`, `GET/PUT/DELETE /internal/schedules/<id>`, `GET /internal/schedules?tenantKey=&ownerEmail=` | save, read, change (bumps `runSeq`; `null` clears a field), delete, list |
| `GET /internal/schedules/due` | enabled schedules whose `nextRunAt` has come, soonest first (up to 50) |
| `POST /internal/schedules/advance` `{documentId, expectedSeq, nextRunAt, job?, skipReason?, consecutiveFailures?, countedJobId?}` | compare-and-set on `runSeq`: moves to the next run and, with `job`, queues that occurrence in the same transaction (one job per `idempotencyKey`); answers `{ok, jobId, existing?}` |
| `POST /internal/schedules/disable` `{documentId, expectedSeq, reason}` | turn off with a reason, if still enabled at that `runSeq` |

## Tests

```sh
cargo test                                                  # registry rules (unit)
node tools/parity-test.mjs --reference http://localhost:1337   # same answers as Strapi; admin API; restart
node tools/build-test.mjs --no-check-export                # a site build reading tenants from here is identical
node tools/visitors-test.mjs                               # the consent route: stored as given, limits, rate limit, CORS, summary, restart
node tools/forms-test.mjs                                  # the form inboxes: encryption at rest, references, tracking, captcha, attachments, mail over SMTP
node tools/migrate-forms-test.mjs                          # moving Strapi's submissions and their files here, against a fake Strapi
node tools/migrate-records-test.mjs                        # moving Strapi's templates, versions, threads, reviews (workspace key from the relation) and releases here
node tools/assist-test.mjs                                 # the assistant: retrieval, answers with sources, the model's failures, simplify/translate/find
```

`parity-test` compares the tenant list and `resolve` for every tenant in both
locales with the reference (a live Strapi in CI) and exercises the admin API.
`build-test` builds public-site twice against the same engine, once with
`WEBX_CONTROL_URL` set, requires that this service answered requests, and runs
`rust-engine/tools/build-diff.mjs` on the two. CI runs all three (the Rust
engine workflow).

## Not yet

Identity and login (C4), bookkeeping such as the audit log, releases and
reviews (C3), the rest of the visitors' runtime routes (C5: the assistant, search statistics, captcha, forms), and Studio reading the tenant
registry from here for its own routing. The database file is one SQLite file;
Postgres for production is decision D3.
