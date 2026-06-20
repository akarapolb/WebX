# WebX Studio

**A multi-tenant, no-code headless CMS backoffice — a modern admin & visual page builder that runs on top of any Strapi backend.**

WebX Studio is a productized control plane for content teams: a fast Next.js admin UI with a WYSIWYG visual builder, per-tenant branding, AI search, and a no-code custom-block system whose blocks render on the live public site. The backend stays Strapi — WebX Studio is the experience layer on top.

> ไทย: ระบบหลังบ้าน CMS แบบ multi-tenant ที่ทำงานบน Strapi — แต่ละหน่วยงาน (tenant) มีเนื้อหา แบรนด์ และบล็อกของตัวเอง สร้างหน้าเว็บแบบ no-code แล้วเผยแพร่ขึ้นเว็บจริงได้ทันที

---

## Highlights

- **Visual Builder (WYSIWYG)** — compose landing pages on a live canvas: inline text editing, drag blocks from the palette onto the page, drag-to-reorder, insert-between, device frames (desktop/tablet/mobile), image upload, AI "generate a section", **Preview** before publish, and one-click **Publish** to the live site.
- **No-code custom blocks** — define your own block types (name, icon, field schema, HTML template with `{{placeholders}}`) with zero code. They appear in the builder palette and **render on the real public website** via template interpolation.
- **Block Marketplace** — block types are scoped per tenant; browse blocks across tenants, **Install** one into your workspace, or **Share to all tenants** (make it global). Each agency curates its own block library.
- **Multi-tenant** — switch workspace (e.g. DGA ↔ PEA); content, forms, users, branding and accent color are all filtered/themed per tenant.
- **Content & rich editor** — browse/filter/publish entries; rich-text body editing.
- **AI Search** — natural-language search over tenant content.
- **Branding** — per-tenant primary color and site preview.
- **Forms inbox, Users & Roles, Dashboard** — real data from the Strapi backend.
- **i18n EN / ไทย**, light/dark theme, `Cmd/Ctrl+K` command palette.

## Architecture

```
┌─────────────────┐     httpOnly cookie      ┌──────────────────┐         ┌─────────────────┐
│  Browser (UI)   │ ───────────────────────► │  Next.js (BFF)   │ ──Bearer► │   Strapi 5      │
│  React 19       │   never sees the token   │  /api/* proxy    │  token   │  (SQLite/Postgres)│
└─────────────────┘                          └──────────────────┘         └─────────────────┘
                                                                                    │
                                                                          public REST API
                                                                                    ▼
                                                                        ┌─────────────────┐
                                                                        │ Public website  │
                                                                        │ (static HTML/JS)│
                                                                        └─────────────────┘
```

- **BFF auth** — the browser never holds the Strapi token. `POST /api/auth/login` calls Strapi `/admin/login`, stores the opaque admin token in an **httpOnly** cookie (`webx_session`), and validates sessions via a self-call to `/admin/users/me`. All Strapi calls go through `/api/strapi/[...path]`, which injects the `Bearer` token server-side.
- **Backend-agnostic** — point `STRAPI_URL` at any Strapi instance. WebX Studio adds no backend coupling beyond the standard content-manager / REST APIs.
- **Custom blocks** are data: a `block-type` collection (key, schema, template, tenant) + a `block.custom` dynamic-zone component (`typeKey` + `props` JSON). The public site fetches block types and interpolates templates at render time — no redeploy to add a block.

## Tech stack

- **Next.js 15.1.6** (App Router) · **React 19** · **TypeScript**
- Plain CSS design system (`app/globals.css`) — design tokens, dark/light, no Tailwind
- Backend: **Strapi 5** (in the sibling `strapi-cms/` project)

## Getting started

### Prerequisites
- Node.js 18+
- A running Strapi 5 backend (see `../strapi-cms`)

### 1. Start the Strapi backend
```bash
cd ../strapi-cms
npm install
npm run develop          # → http://localhost:1337
```

### 2. Configure & run WebX Studio
```bash
cd ../webx-studio
npm install
cp .env.example .env.local   # then edit if needed
npm run dev                  # → http://localhost:3000
```

Open http://localhost:3000 and sign in with your **Strapi administrator** account.

### Environment (`.env.local`)

| Variable | Default | Notes |
|---|---|---|
| `STRAPI_URL` | `http://localhost:1337` | Any Strapi instance |
| `WEBX_SESSION_COOKIE` | `webx_session` | httpOnly session cookie name |
| `WEBX_SESSION_TTL` | `1800` | Session lifetime (seconds). Match Strapi's `ADMIN_SESSION_TTL` — e.g. set both to `28800` for an 8-hour session |

> Never commit `.env.local`. Only `.env.example` is tracked.

## Project structure

```
webx-studio/
├─ app/
│  ├─ (app)/            # authenticated routes: dashboard, content, builder,
│  │                    #   forms, users, search, branding, tokens
│  ├─ api/
│  │  ├─ auth/login     # BFF: Strapi /admin/login → httpOnly cookie
│  │  ├─ auth/logout
│  │  └─ strapi/[...path]  # BFF proxy: injects Bearer token server-side
│  ├─ login/
│  └─ globals.css       # design system + all component styles
├─ components/
│  ├─ VisualBuilder.tsx     # WYSIWYG canvas, drag/drop, preview, publish
│  ├─ BlockTypeEditor.tsx   # no-code block-type editor + marketplace
│  ├─ ContentBrowser.tsx / EntryEditor.tsx / RichText.tsx
│  ├─ AISearch.tsx / Branding.tsx / FormsInbox.tsx / UsersTable.tsx
│  ├─ Shell.tsx / CommandPalette.tsx / TenantProvider.tsx / LangProvider.tsx
│  └─ Icon.tsx / InlineText.tsx
└─ lib/  config.ts · i18n.ts · nav.ts · strapi.ts
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build on :3000 |
| `npm run lint` | Lint |

## Custom blocks — how it works

1. **Builder → Manage block types → New** — give it a name, icon, fields (text / textarea / richtext / image), and an HTML template using `{{fieldKey}}` placeholders.
2. The block appears under **Custom blocks** in the palette (scoped to the current tenant, plus any global blocks).
3. Add it to a page, fill the fields in the inspector, **Save** then **Publish**.
4. The public site fetches block types and renders `block.custom` by interpolating the template with the block's props (text escaped, richtext raw, images resolved to absolute URLs).

**Marketplace:** the *Marketplace* tab lists every block type across tenants. **Install** copies one into your workspace; **Share to all tenants** makes one of your blocks global.

## Roadmap

- Block / page **versioning & revision history** (via Strapi History)
- Deploy target (Vercel + hosted Strapi)
- Drag-reorder across nested sections, block grouping
- Scheduled publishing, A/B variants

## Notes

- The backend lives in the sibling `strapi-cms/` project; this repo also contains a static public site (`site/DGA-Website`) that consumes the Strapi public REST API and renders custom blocks.
- Submission data (form entries, applications, consent logs) is intentionally **not** publicly readable (PDPA) — the public role has read access only to presentational content (landings, block types, etc.).
