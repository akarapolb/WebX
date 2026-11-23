# WebX engine contract

What WebX Studio and the public site need from a content **engine** (today
Strapi 5 or WordPress), written down so a third engine can be built against
it and tested for conformance. Derived from the code as of November 2026:

- write side: `webx-studio/lib/cms/types.ts` (`CmsAdapter`), its two
  implementations `lib/cms/strapi.ts` and `lib/cms/wordpress.ts`, and the
  governance layer `lib/cms/governance.ts` that every Studio call goes through;
- read side: `public-site/lib/cms.ts` (build time) and the browser calls listed
  in section 7 (run time).

Where this document and the code disagree, the code wins; fix the document.

## 1. Two consumers, two surfaces

| Consumer | When | Surface | Auth |
|---|---|---|---|
| WebX Studio (server side, BFF) | Editing | **Write API**: `CmsAdapter` (schema, entries, publish, media, auth) | Editor's session token, kept server-side in an httpOnly cookie |
| public-site build | `next build` (static export) | **Read API**: public REST, published content only | None (public read) |
| Visitor's browser | Run time | **Public runtime API**: assistant, forms, consent, search analytics, tenant contact | None; rate-limited per IP |

A read-only engine (section 9) only has to provide the read API. Studio keeps
writing to the existing engine.

## 2. Tenants

Every piece of content belongs to exactly one tenant (a WebX workspace).

| Field | Meaning |
|---|---|
| `key` | Stable id and the public URL segment (`/dgahub`) |
| `name` | Display name |
| `engine` | `"strapi"` or `"wordpress"`: where this tenant's content lives |
| `publicTemplate` | `"gov-portal"` (default), `"orst"`, `"royalsociety"`, `"dgahub"`: which public-site template renders it |
| `brand` | `orgName {th,en}`, `primaryColor` (hex), `logoUrl` |
| `contact` | `phone`, `email`, `address {th,en}` |
| `footerColumns` | `[{ heading {th,en}, links: [{ label {th,en}, url }] }]` |
| `social` | `[{ label, url }]` |
| `domains`, `active`, `adminEmails` | Routing and access (engine-internal; not read by public-site) |

Rules every engine must keep:

- **Isolation.** A request scoped to tenant A never reads or writes tenant B's
  rows. Strapi does this in a document middleware over the `SCOPED` set
  (`strapi-cms/src/index.ts`): reads are filtered, creates are stamped, updates
  and deletes are ownership-checked. WordPress uses the `wtenant` taxonomy.
- **Scope source.** Public requests name the tenant with `?tenant=<key>` (or
  `X-Tenant`, or the Host). Studio requests are scoped by the editor's
  membership (`adminEmails`); super admins are unscoped and must filter
  explicitly (`filter: [{ field: "tenant.key", op: "eq", value }]`).
- **Unknown or missing tenant.** Strapi resolves the tenant in this order:
  `?tenant=<key>`, then `X-Tenant`, then a Host that matches a tenant's
  `domains`, and otherwise falls back to the default tenant (`dga`, or the
  first active tenant). So an unknown key reads the default tenant's rows in
  every route, never "everything" and never an empty result. The Rust read
  engine copies this (the contract test replays it). A stricter rule for the
  target (an explicit unknown key returns an empty result, and only a request
  naming no tenant falls back) is open decision D9 in
  `target-architecture.md`; until it is taken, engines keep Strapi's behaviour.

## 3. Locales

- Locales are `th` (default) and `en`. A localized content type has a separate
  row per locale under the same `documentId`; a missing locale is an empty
  result (HTTP 200 with no row), not an error. Through the adapter,
  `entries.get` of a locale that was never written resolves (never throws) to
  `null` or to an object without a `documentId`; Strapi's adapter returns the
  latter and the Visual Builder tests for the missing `documentId`. An unknown
  `documentId` is a `CmsError` with status 404.
- Every read takes `locale`; the response is in that locale only.
- WordPress has no per-locale rows: the English version of a page's blocks is a
  sibling field `blocks_en` on the same entry, and `ContentTypeInfo.localized`
  is always `false`.

## 4. Content model

Identifiers: `documentId` (string, stable across locales and versions) is the
id Studio uses; `id` (number) is engine-internal. Every row has `createdAt`,
`updatedAt`, and when published `publishedAt`.

Content types the public site reads (Strapi uid → REST plural):

| Type | Plural | Localized | Key fields |
|---|---|---|---|
| `api::page.page` | `pages` | yes | `title`, `slug` (unique per tenant + locale, a plain string), `seoDescription`, `blocks` (dynamic zone, section 5) |
| `api::article.article` | `articles` | yes | `title`, `slug`, `excerpt`, `body` (HTML), `publishDate`, `coverImage` (media), `categoryLabel` |
| `api::faq.faq` | `faqs` | yes | `question`, `answer`, `order` |
| `api::service.service` | `services` | yes | `title`, `description`, `url`, `order` |
| `api::dataset.dataset` | `datasets` | yes | `key`, `title`, `description`, `sourceName`, `sourceUrl`, `license`, `fields` (JSON: `[{key, label{th,en}, type, unit, valueLabels}]`), `rows` (JSON array of records), `verified`, `updatedOn`, `updateCycle` |
| `api::menu-item.menu-item` | `menu-items` | no | `label`, `labelEn`, `url`, `order`, `openNewTab`, `column`, `megaMenu` (JSON) |
| `api::home-page.home-page` | `home-pages` | yes | gov-portal home: `hero`, `featuredPromo`, `stats` |
| also read by gov-portal | `banners`, `videos`, `awards`, `jobs`, collection pages | — | see `public-site/lib/cms.ts` |

Studio additionally edits: `landing` (A/B landing pages), `block-type` (custom
blocks), `icon`, `page-template`, `page-version` (history), `release`
(scheduled publishing), `review`, form inboxes (`complaint`, `application`,
`registration`, `contact-message`), `consent-log`, `search-stat`, `tenant`,
`audit-log`, plus the governance types (custom roles, field policies, MFA, SSO).

## 5. Blocks

A page is an ordered list of blocks. On the wire each block is an object with
`__component: "block.<name>"`, an `id`, and its fields; nested components
(items) are arrays of objects. Media fields are expanded objects with `url`
(relative to the engine, or absolute). Blocks the dgahub template draws:

| Block | Fields (main) |
|---|---|
| `block.hero` | `kicker`, `heading`, `headingAccent`, `subheading`, `ctaLabel`, `ctaUrl`, `image` |
| `block.richtext` | `body` (HTML, sanitised on render) |
| `block.feature-grid` | `heading`, `columns` (`"2"`/`"3"`/`"4"`), `items[] {icon, title, text, url}` |
| `block.stat-row` | `items[] {label, value}` |
| `block.tabs` | `heading`, `items[] {title, body}` |
| `block.blockquote` | `quote`, `attribution` |
| `block.image` | `image`, `caption`, `full` |
| `block.spacer` | `size` (`sm`/`md`/`lg`), `style` (`space`/`line`) |
| `block.embed` | `src`, `title`, `height` |
| `block.cta-banner` | `heading`, `text`, `buttonLabel`, `buttonUrl` |
| `block.chart` | `eyebrow`, `title`, `intro`, `datasetKey`, `chartType` (`line`/`bar`), `xField`, `yField`, `seriesField`, `filter` (`"k=v,v;k2=v"`), `invertY`, `showTable` |
| `block.dataset-download` | `eyebrow`, `title`, `intro`, `datasetKeys` (comma list), `showDictionary` |
| `block.news-panel` | `newsTabLabel` (items come from `articles`) |
| `block.faq` | `heading` (items come from `faqs`) |
| `block.assistant` | `eyebrow`, `title`, `intro`, `placeholder`, `suggestions[]`, `disclaimer` |
| `block.form` | form definition (see `lib/formFieldDefs.ts`) |

Other templates also use `highlights`, `featured-promo`, `video-channel`,
`awards`, `collection-list`, `comparison`, `logo-cloud`, `team-grid`,
`testimonials` and `custom` (an instance of a tenant-defined `block-type`). The
JSON schemas are in `strapi-cms/src/components/block/`.

**Dialects.** Studio's Visual Builder works in one block dialect per template
(`webx-studio/lib/blockDialect.ts`): `toBuilder()` on read, `toWire()` on write.
For Strapi tenants the dialect is the identity. WordPress (ORST, Royal Society)
stores `type` instead of `__component` and different field names. An engine
must round-trip blocks byte-for-byte as written.

## 6. Read API (what the public-site build calls)

All paths are relative to the engine base (`STRAPI_URL`). Every call carries
`tenant=<key>&locale=<th|en>`. The response is `{ "data": [...] }` (an array,
even for one row). Only **published** rows are returned. An unreachable engine
must fail the build (non-2xx or network error); an empty list is a valid
answer.

| Purpose | Request |
|---|---|
| Tenant list | `GET /api/tenants/keys` → `{data: [{key, engine, publicTemplate}]}` |
| One tenant | `GET /api/tenants/resolve?tenant=<key>&locale=th` → `{data: Tenant}` |
| Page by slug | `GET /api/pages?filters[slug][$eq]=<slug>&populate[blocks][populate]=*&pagination[pageSize]=1` |
| Page slugs | `GET /api/pages?fields[0]=slug&pagination[pageSize]=100` |
| Menu | `GET /api/menu-items?sort=order:asc&pagination[pageSize]=50` (not localized; `labelEn` holds English) |
| News | `GET /api/articles?sort=publishDate:desc&populate=coverImage&pagination[pageSize]=100` |
| FAQ | `GET /api/faqs?sort=order:asc&pagination[pageSize]=100` |
| Services | `GET /api/services?sort=order:asc&pagination[pageSize]=100` |
| Datasets | `GET /api/datasets?sort=key:asc&pagination[pageSize]=100` |
| gov-portal home | `GET /api/home-pages?populate[hero][populate]=*&populate[featuredPromo][populate]=*&populate[stats]=true&pagination[pageSize]=1` |
| Media | `GET <url>` from a media object (relative URLs are joined to the engine base) |

Query features used: `filters[<field>][$eq]`, `sort=<field>:<asc|desc>`,
`pagination[pageSize]`, `fields[n]`, `populate` (blocks fully populated one
level deep, media expanded). WordPress tenants are read through
`/wp-json/wp/v2/<type>?wtenant=<termId>` and ACF fields instead (`getWp*` in
`public-site/lib/cms.ts`).

## 7. Public runtime API (visitor's browser)

Called with `PUBLIC_CMS_URL` (empty means switched off, see
`public-site/lib/publicCms.ts`). All take `?tenant=<key>`, are anonymous and
rate-limited per IP. WordPress tenants call their own routes through
`PUBLIC_WORDPRESS_URL` under the same rule (`lib/publicCmsRule.mjs`).

| Route | Body → response |
|---|---|
| `POST /api/assist/ask` | `{q, locale}` → `{answer, mode: llm\|extractive\|none, sources[{n,kind,title,url}], cited[]}`; rules in `strapi-cms/src/utils/answer.ts` |
| `GET /api/assist/status` | → `{llm: boolean}` |
| `POST /api/search-stats/log` | `{q, locale, results}` → 204 (aggregated, anonymous) |
| `POST /api/consent-logs` | `{data: {consentId, action, categories, language, path, userAgent}}` |
| `GET /api/captcha` | → `{data: {id, question}}` |
| form submit / track | per form definition (`submitEndpoint`, `submitMultipartEndpoint`, `trackEndpoint` in `lib/formFieldDefs.ts`) |
| `GET /api/tenants/resolve` | contact details for gov-portal headers |

## 8. Write API (what Studio calls)

`CmsAdapter` (`webx-studio/lib/cms/types.ts`); every call goes through
`governance.ts`, which adds permission checks, field policies, audit log,
release/review rules and the rebuild trigger. Errors are `CmsError` with the
HTTP status.

| Method | Strapi | WordPress |
|---|---|---|
| `schema.listContentTypes()` → `ContentTypeInfo[]` (`uid, name, api, pluralName, attributes, localized`) | `GET /content-manager/content-types` (collection types under `api::`) | fixed registry (`POST_TYPES`), `localized: false` |
| `entries.list(uid, {filter, sort, page, pageSize, status, q, locale})` → `{data, total, pageCount}` | `GET /content-manager/collection-types/<uid>?filters[a][b][$op]=v&sort&page&pageSize&status&_q&locale` | `GET /wp/v2/<restBase>?status&wtenant&search&page&per_page` (status `publish` ↔ `published`) |
| `entries.get(uid, documentId, {locale})` | `GET …/<uid>/<id>?locale=` | `GET /wp/v2/<restBase>/<id>` |
| `entries.create(uid, data, {locale})` | `POST …/<uid>` (locale in body; new documentId) | `POST /wp/v2/<restBase>` (`tenant` → `wtenant` term) |
| `entries.update(uid, id, data, {locale})` | `PUT …/<uid>/<id>?locale=` (also creates a missing locale) | `POST /wp/v2/<restBase>/<id>` |
| `entries.remove(uid, id, {locale})` | `DELETE …/<uid>/<id>?locale=` | `DELETE /wp/v2/<restBase>/<id>` |
| `publish.publish / unpublish(uid, id, {locale})` | `POST …/<uid>/<id>/actions/publish\|unpublish` | `status: "publish" \| "draft"` |
| `media.upload(file, tenantKey)` → `MediaAsset {id, documentId, url, mime, name, thumbnailUrl, width, height, caption, alt, tags}` | `POST /upload` then claim for tenant `PUT /api/media-meta/<documentId>` | `POST /wp/v2/media` + `wtenant` term |
| `media.list / update / remove` | `/api/media-meta` (tenant-scoped) | `/wp/v2/media?wtenant=` |
| `auth.me / listRoles / listUsers / findUserByEmail / create / remove` | `/admin/users/me`, `/admin/roles`, `/admin/users` (create inactive, then activate with a temp password) | `/wp/v2/users` with application passwords |

Publishing semantics: a draft and a published version may exist at once;
editing changes the draft; `publish` copies the draft to the published version,
which is the only one the read API returns. `unpublish` removes the published
version and keeps the draft. Validation: a draft may be saved incomplete
(Strapi does), but an entry missing a required field is never published:
`publish` fails with `CmsError` 400 (an engine may instead refuse the create
with 400). Every publish/unpublish must trigger a public-site
rebuild (`webx-studio/lib/publicSiteBuild.ts`, or a webhook; see
`docs/hosting-plan.md`).

Auth: Studio signs in against the engine (`/admin/login` for Strapi; MFA and
SSO are layered in Studio), keeps the token server-side, and sends
`X-WebX-Governed` and `X-Internal-Secret` so the engine trusts governance's own
audit writes and MFA exemption.

### Rust engine's write API

The Rust engine (`rust-engine/`, started with `--db`) exposes the same
operations as `/write/<plural>[/<documentId>[/publish|unpublish]]` instead of
Strapi's admin paths, with a per-tenant bearer token instead of an admin login;
see `rust-engine/README.md`. An adapter for it maps the `CmsAdapter` calls above
onto these, media included (`/write/_media`); users are not in it (control plane, C2).

## 9. Conformance

An engine conforms when, for the same content:

1. **Read API:** every request in section 6 returns the same JSON (after
   sorting object keys and ignoring `id`, `createdAt`, `updatedAt`) as the
   reference Strapi engine. A recorded fixture set (one tenant, both locales)
   is the test.
2. **Built site:** `npm run build` of public-site against it produces an `out/`
   folder identical to the build against Strapi (HTML, JSON, CSV,
   `search-index.json`, `sitemap.xml`), apart from Next's build id and the
   order of Next's own React Server Components rows, which changes between
   any two builds; and passes `scripts/check-export.mjs`. The read-only engine
   in `rust-engine/` passes 1 and 2 (`tools/contract-test.mjs`,
   `tools/build-diff.mjs`).
3. **Write API (only for a full engine):** the e2e `studio-roundtrip` and
   `user-management` tests pass against it, and so does the adapter
   conformance suite (`webx-studio/tests/conformance/`: entries, draft and
   publish, locales, list, errors, validation and tenant isolation; it passes
   on the in-memory reference engine and on Strapi; WordPress and Rust
   harnesses, and media and user cases, are still to be added).
4. **Isolation:** a cross-tenant request returns nothing (e2e
   `cross-tenant-isolation`).
