# WebX Studio — Technical Documentation

> A productized, multi-tenant, **AI-native** headless CMS backoffice — a modern
> admin UI + visual page builder that runs on top of **Strapi 5 (Community
> Edition)** as the experience layer. Enterprise-grade governance and AI, on CE.
>
> ไทย: ระบบหลังบ้าน CMS หลายหน่วยงาน (multi-tenant) สร้างหน้าเว็บแบบ no-code
> เผยแพร่ขึ้นเว็บจริงได้ทันที พร้อมฟีเจอร์ระดับ Enterprise และ AI — ทั้งหมดบน Strapi CE.

This is the single source of truth for how WebX is built. It is written to be
rendered on the WebX website (it is plain Markdown — any docs renderer works).

---

## Table of contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Core CMS](#3-core-cms)
4. [Enterprise features](#4-enterprise-features)
5. [AI-native layer](#5-ai-native-layer)
6. [Integrations — MCP, CLI, REST](#6-integrations--mcp-cli-rest)
7. [Security & compliance](#7-security--compliance)
8. [Operations — config, run, deploy](#8-operations--config-run-deploy)
9. [Roadmap](#9-roadmap)

---

## 1. Overview

WebX Studio is the **experience + governance layer** over Strapi. Strapi stays
the data/content engine; WebX adds a fast Next.js admin, a WYSIWYG page builder,
a no-code block system, and an AI-native + enterprise-governance layer that
Strapi reserves for its paid Enterprise tier — re-implemented on Community
Edition.

**Positioning:** unicorn-level, beating any CMS — by owning two lanes at once:
a Webflow-class visual builder **and** an agentic/RAG AI layer, with
government-grade compliance auditing nobody else ships.

**First tenant / reference use case:** a Thai government agency website (DGA /
สพร.), so **Thai language, WCAG 2.2 AA, PDPA, and SEO/GEO/AEO** are
first-class concerns.

| Layer | Technology |
|---|---|
| Admin UI | Next.js 15 (App Router), React 19, TypeScript, plain-CSS design system |
| Auth / proxy | BFF (Backend-for-Frontend) with httpOnly session cookies |
| Content engine | Strapi 5 (SQLite in dev, Postgres in prod) |
| AI gateway | LiteLLM proxy (OpenAI-compatible) — **provider-agnostic** |
| Public site | Static HTML/JS consuming Strapi's public REST API |
| Agent surface | MCP server + CLI |

---

## 2. Architecture

```
┌──────────────┐   httpOnly cookie    ┌──────────────────┐   Bearer token   ┌────────────┐
│  Browser UI  │ ───────────────────► │  Next.js (BFF)   │ ───────────────► │  Strapi 5  │
│  React 19    │  token never seen    │  /api/* proxy    │  injected server │  + Postgres │
└──────────────┘                      └────────┬─────────┘                  └─────┬──────┘
                                               │ /api/ai/*                         │ public REST
                                               ▼                                   ▼
                                      ┌──────────────────┐                ┌────────────────┐
                                      │ LiteLLM gateway  │                │  Public website │
                                      │ (any LLM/local)  │                │  (static HTML)  │
                                      └──────────────────┘                └────────────────┘
```

### 2.1 BFF authentication (token never reaches the browser)

- `POST /api/auth/login` → Strapi `/admin/login` → the opaque admin access token
  is stored in an **httpOnly** cookie (`webx_session`). The browser never holds
  the token.
- Every Strapi call goes through `/api/strapi/[...path]`, which injects the
  `Bearer` token **server-side** and streams the response back. Binary
  (images/files) is passed through via `arrayBuffer` so uploads are never
  corrupted.
- Session validation is a self-call to `/admin/users/me` (the Strapi 5.48 token
  is opaque, not a JWT).

### 2.2 Session auto-refresh

Strapi 5.48 issues a **short-lived access token** plus a rotating, single-use
**refresh token** (`strapi_admin_refresh`). On login WebX captures the refresh
token into its own httpOnly cookie (`webx_refresh`); a client `SessionKeeper`
calls `/api/auth/refresh` on load, every 10 minutes, and when the tab regains
focus. That route exchanges the refresh token via `POST /admin/access-token`,
rotating both cookies. Result: an open session stays alive (up to the configured
max session lifespan) **without re-login** — and survives a backend restart,
because the refresh token lives in Strapi's DB.

### 2.3 Multi-tenancy

A `tenant` relation scopes content, branding, users, and AI config. A
Strapi document-service middleware enforces tenant scope on reads/writes
(super admins are exempt); the admin UI filters by the selected workspace.
The public site selects a tenant by host / `?tenant=` and renders that tenant's
content + brand.

---

## 3. Core CMS

### 3.1 Visual page builder (WYSIWYG)

- Live canvas with **inline editing**, **drag-and-drop** from a block palette,
  drag-to-reorder, insert-between, device frames (desktop/tablet/mobile).
- **Preview** (read-only, full-width) before publishing; one-click **Publish**.
- Create and switch landing pages (page selector + "New page").
- "Generate a section" — AI drafts a block (see §5).

### 3.2 No-code custom block types + marketplace

- Define a block type with zero code: name, icon, a field schema
  (text / textarea / richtext / image), and an HTML template with
  `{{placeholders}}`.
- Custom blocks appear in the builder palette and **render on the live public
  site** by template interpolation (text escaped, richtext raw, images resolved
  to absolute URLs).
- Block types are **per-tenant**; a **marketplace** lets you browse across
  tenants, **Install** a block into your workspace, or **Share to all tenants**
  (make it global).

### 3.3 Content, media, editor

- Browse / filter / search entries; create new entries (drafts) for any content
  type; rich-text body editing.
- Media field detects file type: images render as thumbnails, other files
  (PDF/doc/zip) render as a file card + link. Upload accepts any file type.
- Per-field AI actions (see §5.2).

---

## 4. Enterprise features

All built on Strapi **Community Edition** (equivalents are Enterprise-only in
stock Strapi), and all enabled by WebX's audit log + RBAC + review primitives.

| Feature | What it does |
|---|---|
| **Version history + diff** | Every Publish snapshots the page (`page-version`). A History drawer lists versions; "Compare with current" shows exactly which blocks/fields changed. One-click **Restore**. |
| **Review / approval workflow** | Submit an entry for review → a Kanban board (In review → Changes → Approved → Published) moves it through stages with assignee + transition history. Publishing from "Approved" also publishes the live entry. |
| **Releases** | Group entries and **Publish now** or **Schedule**. A backend job (60-second tick) auto-publishes scheduled releases when their time arrives. |
| **Audit log** | Every admin content change (actor / action / target / time) is captured server-side by a document-service middleware and shown as a filterable feed. |
| **Field-level RBAC** | Per-role **Field Access** policies hide or lock individual fields for a content type — **enforced server-side** (forbidden fields are stripped from writes), not just hidden in the UI. Super admins bypass. |
| **A/B testing** | Split a landing into variant A/B with a traffic split; the public site serves a sticky variant per visitor and logs views/conversions; a live results panel shows the conversion rate and the leading variant. |
| **Content Audit** | A read-only AI agent that flags SEO/AEO, PDPA, quality, and freshness issues across published content (see §5.4). |

Cross-cutting: **i18n (EN / ไทย)**, light/dark theme, `Cmd/Ctrl+K` command
palette, and accessibility (visible keyboard focus, reduced-motion, ARIA).

---

## 5. AI-native layer

> **Design principle: LLM-agnostic.** No provider lock-in. Every AI call goes
> through one server-side abstraction (`lib/llm`) backed by a **LiteLLM** proxy,
> so the model/provider is swappable per tenant/env with no feature-code change.
> Every AI feature **degrades gracefully** when AI is unconfigured.

### 5.1 The gateway (`lib/llm` + LiteLLM)

- `lib/llm.ts` exposes `generate()`, `structured()` (JSON-schema-constrained
  output for schema-aware actions), and `embed()` (RAG) — calling LiteLLM's
  OpenAI-compatible API. Keys stay server-side; `llmConfigured()` drives the
  graceful fallback.
- `/api/ai/generate` — auth-gated BFF route; returns `503` when no LLM is
  configured (callers fall back).
- LiteLLM config (`litellm/config.yaml`) defines friendly aliases —
  `webx-default`, `webx-thai`, `webx-local` (Ollama for PDPA-sensitive tenants),
  `webx-embed` — plus provider fallbacks, a response cache, and **per-tenant
  virtual-key budgets**. Swap a provider by editing config only.

### 5.2 Schema-aware AI actions (per field)

Every editable field in the entry editor has an **AI** menu: Improve writing,
Expand, Make concise, Formal tone, Fix grammar, and Translate → ไทย / → English.
The action sends the field's value to the provider and replaces it in place;
rich fields preserve simple HTML. Read-only (field-RBAC) fields get no AI menu.

### 5.3 RAG semantic search with citations

Upgrades AI Search from keyword to retrieval-augmented, citation-grounded
answers:

- `/api/ai/index` chunks a tenant's published content, embeds it via `lib/llm`
  (any provider), and stores the vectors in `doc-embedding` (in-app cosine ranks
  results — SQLite-friendly; **pgvector** is the production upgrade). Triggered
  by a "Reindex" button.
- `/api/ai/search` embeds the query, ranks by cosine, then answers using **only**
  the top sources with inline `[n]` citations.
- AI Search tries RAG first (a "RAG" badge + citation chips) and **falls back to
  keyword** search when AI isn't configured — so it works with zero setup.

Retrieval recipe follows Anthropic's **Contextual Retrieval** (contextual
embeddings first for best cost/perf; add hybrid BM25 + reranking later).

### 5.4 Agentic Content Audit (read-only)

The safest agentic surface — it analyses and reports, **never writes**.

- **Rule-based layer (no AI key needed):** missing meta description (SEO/AEO),
  thin content, stale (> 365 days), possible 13-digit national ID (**PDPA**),
  missing title. Runs instantly and free.
- **AI insights layer (when configured):** one provider-agnostic LLM pass adds
  qualitative findings — clarity, tone, accessibility wording, GEO/AEO
  readiness, PDPA nuance.
- **Output:** findings grouped by severity (high/med/low) and dimension,
  filterable, each linking to the entry; a summary of items scanned vs issues.
- **Why it matters:** a content-compliance auditor for the government lane that
  no mainstream CMS ships — and it surfaces exactly the SEO/GEO/PDPA gaps the
  DGA TOR cares about. Read-only + tenant/permission-scoped by design.

### 5.5 AI Translate → Review (safe agentic write)

The first agentic *write* op — done the safe way. From any entry, "Translate →
EN / ไทย" sends its localized text fields to the provider, then files the result
as a **translation review** on the Reviews board. It **never writes the entry
directly**: a human reviews the draft and clicks **Apply**, which writes the
target locale's draft (still unpublished — a human publishes it).

- The translator preserves HTML, a formal public-sector tone, and proper
  nouns/acronyms (DGA, สพร., PDPA, ThaID).
- Directly serves the bilingual (Thai default + English) requirement of the DGA
  TOR — at scale, through the existing approval workflow.
- Degrades gracefully: returns `503` when no LLM is configured.

### 5.6 Guardrails

Aligned to OWASP Top-10 for LLM Apps (2025): **no autonomous publish**
(human-in-the-loop via the review workflow), **least-privilege** tool access
(field-RBAC + the API token's permissions), **citation-grounded** answers
(misinformation control), and a **full audit trail** of agent-driven changes.
Cost/latency is managed via prompt/response caching and per-tenant budgets.

---

## 6. Integrations — MCP, CLI, REST

WebX content can be operated four ways: the Web UI, an MCP server, a CLI, and the
REST/BFF API.

### 6.1 MCP server (`mcp-webx/`)

A zero-dependency Node stdio JSON-RPC **Model Context Protocol** server, so any
MCP client (Claude Code, Claude Desktop, Cursor) — or an agent — can work with
the CMS.

- **Tools:** `list_content_types`, `search_content`, `get_entry`,
  `create_entry` (draft), `update_entry`.
- Talks to Strapi REST with a Strapi API token; the token's permissions bound
  what the agent can do.
- **Safe surface:** read + create/update **drafts** only — **no publish or
  delete tool**, so going live stays a human action.

```jsonc
// .mcp.json (Claude Code / Desktop / Cursor)
{ "mcpServers": { "webx-cms": {
  "command": "node", "args": ["mcp-webx/server.mjs"],
  "env": { "STRAPI_URL": "http://localhost:1337", "STRAPI_TOKEN": "<token>" } } } }
```

### 6.2 CLI (`cli-webx/`)

A zero-dependency Node CLI for the terminal, scripts, and **CI**:

```
webx types                          list content types
webx ls <type> [-q query] [-n 20]   list / search entries
webx get <type> <documentId>        full entry as JSON
webx new <type> --title=.. --k=v    create a draft
webx set <type> <id> --field=value  update an entry (stays draft)
webx audit [--type t] [--tenant k]  content audit (SEO/AEO · PDPA · quality)
webx ai <prompt>                    ask the configured LLM (via LiteLLM)
```

`webx audit` runs the same rule engine as the in-app Content Audit — handy as a
**CI gate** (e.g. fail a build on a high-severity PDPA finding). Read is
token-less for public-readable types; writes need a token; no publish/delete.

### 6.3 REST / BFF

The public site consumes Strapi's public REST API. Internal tools call the BFF
(`/api/strapi/[...path]`), which injects auth server-side. AI endpoints live
under `/api/ai/*` (generate, index, search, audit).

---

## 7. Security & compliance

- **Token isolation** — the Strapi admin token never reaches the browser
  (httpOnly cookie + BFF proxy).
- **Field-level RBAC** — enforced server-side; forbidden fields are stripped on
  write, not just hidden.
- **PDPA** — submission data (form entries, applications, consent logs) is **not**
  publicly readable; the public role can read only presentational content. The
  Content Audit flags possible personal IDs in content.
- **Rate limiting** — the anonymous A/B endpoint is rate-limited and
  field-sanitized; housekeeping prunes audit-log / event / version rows older
  than 90 days.
- **Accessibility (WCAG 2.2 AA)** — visible keyboard focus, reduced-motion
  support, ARIA on icon-only controls and dialogs.
- **AI safety** — no autonomous publish, least-privilege agency, citation
  grounding, full audit trail (see §5.5).

---

## 8. Operations — config, run, deploy

### 8.1 Run (development)

```bash
# 1. Strapi backend
cd strapi-cms && npm install && npm run develop        # :1337

# 2. WebX admin
cd webx-studio && npm install && cp .env.example .env.local && npm run dev   # :3000

# 3. (optional) AI gateway
pip install "litellm[proxy]" && litellm --config litellm/config.yaml --port 4000
```

### 8.2 Environment (`webx-studio/.env.local`)

| Variable | Purpose |
|---|---|
| `STRAPI_URL` | Strapi instance (backend-agnostic) |
| `WEBX_SESSION_COOKIE` / `WEBX_SESSION_TTL` | BFF session cookie + lifetime |
| `WEBX_REFRESH_COOKIE` / `WEBX_REFRESH_TTL` | Refresh-token cookie + lifetime |
| `LITELLM_URL` / `LITELLM_KEY` | AI gateway (leave URL empty to disable AI) |
| `LITELLM_MODEL` / `LITELLM_EMBED_MODEL` | Default chat / embedding aliases |

Strapi admin session lifespans are set in `strapi-cms/config/admin.ts`
(`auth.sessions.*`, in seconds); the BFF cookie TTL should match.

### 8.3 Deployment

- **Admin:** Vercel (or any Node host) for the Next.js BFF.
- **Backend:** hosted Strapi on Postgres (enable **pgvector** for RAG at scale).
- **AI gateway:** LiteLLM as a service (Redis cache in prod); mint per-tenant
  virtual keys with budgets; point PDPA-sensitive tenants at a local model.
- **Public site:** static hosting / CDN.

---

## 9. Roadmap

- **Deploy** target (Vercel + hosted Strapi) for a public demo URL.
- **pgvector** for RAG at scale; a **Thai evaluation set** to validate retrieval
  on Thai/government content before locking the RAG stack.
- **Agentic write-ops** gated by review + RBAC; MCP write-tools behind approval
  (the AI Translate → Review flow in §5.5 is the first of these).
- DAM-style media library, webhooks, shareable draft-preview links.

---

*This document tracks the current build. The codebase is the authority; update
this doc in the same change when behaviour changes.*
