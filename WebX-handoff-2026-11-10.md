# WebX — handoff (2026-11-10)

For the next agent picking up WebX. It covers the work from 9–10 Nov 2026 on branch **`ktb-dev`** (everything is committed and pushed, the last commit being the one that adds this file), how to run and test it, and what is still open. The previous handoffs (`WebX-handoff-2026-09-11.md`, `-09-15.md`) and `docs/TECHNICAL.md` still describe the older parts.

The user writes in Thai; answer in Thai. They test in the browser themselves and send screenshots.

---

## 0. Rules the user has set (keep them)

- **Commit / push only when asked.** Branch is `ktb-dev`; main is `main`. Commit messages end with a `Co-Authored-By:` line.
- **Never** `docker compose down -v` and never delete Docker volumes (all content lives in them).
- **Do not edit `litellm/config.yaml`.** If the model gateway answers 429 / "insufficient balance", tell the user to top up Moonshot; don't work around it.
- Do not connect to outside infrastructure (e.g. `port.kloudstone.com`) without explicit permission.
- No secrets in messages or files. `.env` is gitignored; read keys from it in scripts, never print them.
- Ask before anything outward-facing or hard to undo.

## 1. Running it

Services (Docker Compose, profiles `ai`, `wordpress`, `site`):

| Service | Port | What |
|---|---|---|
| `webx` (Studio, Next.js) | 3000 | The editor app: Visual Builder, Agent, content, admin |
| `strapi` + `db` (Postgres) | 1337 | Themes, menus, reviews, audit, tenants, page versions (`api::page-version.page-version`) |
| `wordpress` + `wp-mysql` | 8081 | Page content for the WordPress tenants **ORST** and **Royal Society** (`acf.blocks`, English in `blocks_en`) |
| `site-builder` + Caddy (`site`) | 8090 | The static public site, rebuilt on publish |
| `litellm` | 4000 | AI gateway (Kimi/Moonshot); model aliases in `litellm/config.yaml` |
| public-site **dev server** | 3100 | Run outside Docker; the Builder's preview iframe (harness) loads from it |

Start-up the user calls "run this proj":
1. Start Docker Desktop.
2. `docker compose --profile ai --profile wordpress --profile site up -d`, then wait until `strapi` and `webx` are healthy.
3. `npm --prefix <abs path>/public-site run dev` (port 3100), run in the background.
4. Check the ports, the site-builder `/status`, the logins (`startup-checks.mjs`) and the LiteLLM `webx-kimi` model, then report the Wi-Fi IP (e.g. `http://192.168.8.10:3000`).

After changing Studio code: `docker compose --profile ai --profile wordpress --profile site build webx && … up -d webx` (about 2–3 min). Public-site changes hot-reload on 3100; the static site (8090) only changes on publish.

Test login for scripts: `POST /api/auth/login {email:"orst-editor", password: <WORDPRESS_ORST_APP_PASSWORD from .env>, engine:"wordpress"}`.

## 2. Architecture in one screen

- **Studio** (`webx-studio/`) is a BFF over WordPress and Strapi (`lib/cms/governance.ts` = `governed.*`, every write is permission-checked).
- **Visual Builder** (`components/VisualBuilder.tsx`, very large): blocks live in builder dialect (`__component: "orst.card-grid"`) and are converted to wire dialect (`type: "card-grid"`) by `lib/blockDialect.ts` (any extra key on a block passes through, e.g. `styles`, `boxes`, `__label`, `__locks`, `__names`).
- **Block catalog**: `lib/blockCatalog.ts` (fields, lists, `tpl`).
- **Preview harness**: for ORST and Royal Society the preview is a cross-origin iframe to `public-site` `/orst/preview` or `/royalsociety/preview`, driven by `postMessage`:
  - Studio side: `components/blockPreview/RealPreview.tsx`.
  - Site side: `public-site/templates/_builder/HarnessBridge.tsx`. The protocol is documented at the top of that file: render, select, component, box, layers, imgpos, undo, navigate.
- **Styling**: elements tagged with `vc(b, key)` → `data-vb-s` / `data-vb-c`. `b.styles[key]` is turned into CSS by `public-site/templates/_builder/styles.ts` (`stylesCss`, `styleDecls`), which checks every value; `STYLE_KEYS` lists them all. Move/resize per device: `b.boxes[device][key]` (`boxes.ts`).
- **Templates**: `public-site/templates/orst/Blocks.tsx` and `royalsociety/Blocks.tsx`.
- **Agent**: `webx-studio/lib/agent/`.
  - `tools.ts` is the registry. Tool `mode` read/draft/submit/publish is gated by agent level; `shouldPropose` turns writes into proposals in review mode; publish-mode tools only appear when `publishMode === "auto"`.
  - Proposals are applied in the Builder by `applyAgentProposal` (handles `replace`, `at`, `move`, `all`).
  - Run loop: `runtime.ts`. Gateway models: `lib/aiModels.ts`.

## 3. Done and pushed (9–10 Nov)

### `6ea5e50` — builder, site, agent
- **Layers panel v1** (eye = hide while editing only, never saved). A **layer-coverage audit** across every block of every real ORST/RS page found and tagged the parts that were outside any layer (ORST contact form, breadcrumb, facts, form fields, export buttons, scroll arrows …) via `data-vb-layer`. The audit script is described in §6.
- **Picture position**: double-click a picture in the preview to enter picture mode; drag to pan; wheel or +/- to zoom (≤400%). Stored as `styles[key].bgPosition` ("x% y%") and `imgZoom`. `styles.ts` `imgPositionDecls` writes `object-position` plus `scale` / `transform-origin` / `clip-path` for the component's own `<img>`.
- A **section background picture replaces the hero photo / RS slideshow** (it used to sit hidden underneath).
- **Undo/Redo** buttons with labels and step counts.
- **History**: rename a version, grouped by day, time to the second, and "Compare with now" shows old → new values (`lib/versionHistory.ts`).
- **Auto-links**: URLs and e-mails typed in text become links (`public-site/lib/autolink.ts`, safeLink-checked).
- **Bug fix**: `components/Picture.tsx` offered a `.webp` for every `.jpg`. Uploaded pictures have no `.webp`, so they showed broken (a browser does **not** fall back from a 404 `<source>`). Now only `/assets/**` gets the `.webp`.
- Agent **`save_attached_image`** (a picture attached in the chat → media library) and `set_component_style` `bgImage` / `bgFit`.
- **Add model pop-up** in Agent settings. The `/api/ai/models` POST/DELETE needs LiteLLM with a database, which is **not enabled** (see §5).
- "href" fields are labelled "Hyperlink".

### `1e9d527` — the agent can do what a person does in the Builder
- `set_component_style` covers **all 74 style properties** (`lib/agent/styleSpec.ts`) except `customCss` (people only), plus `variant`: tablet / mobile / dark / hover / focus / active. Test `agent-style-spec.test.ts` fails if the agent's list drifts from `styles.ts STYLE_KEYS`.
- New tools:
  - Blocks: `move_block`, `duplicate_block`, `rename_block`, `set_component_box`.
  - Versions: `list_page_versions`, `restore_page_version`, `rename_page_version`.
  - Live data and scheduling: `set_block_source`, `schedule_page` (publish mode only).
- Verified with the **live agent** on a scratch page (deleted afterwards).

## 4. Last commit (with this handoff) — Layers v2 and word formatting

The user picked items **#2 and #4** from a "WebX vs Figma" gap list. Both are done, unit-tested and checked in a real browser, and committed together with this file.

### #4 Layers panel v2 (Figma-style page tree)
- `components/LayersPanel.tsx` (rewritten) is now a left column next to the preview (`.vb2.ly-open`), toggled by ☰ in the toolbar (remembered in `localStorage` `webx_vb_layers`).
- It shows every block as a top row:
  - drag to reorder (`reorder(from, to)`);
  - double-click to rename (`__label`);
  - lock and eye.
- The selected block expands into its parts:
  - rename (saved in `b.__names[key]`), lock (saved in `b.__locks[]`; `"section"` locks the whole block), eye;
  - **Shift/Ctrl/Cmd-click** picks several parts, and `multiStyleProps` applies one style change to all of them.
- Locks go to the harness as `locked: ["<i>|<key>", "<i>|section", "<i>|layer:<name>"]`. The harness then refuses to pick, drag, arrow-nudge or pan those parts.
- "Group" is covered by multi-select: parts come from the template's DOM, so they cannot be regrouped.

### #2 Formatting a few words (bold / italic / underline / strike / link / colour)
- **Storage**: the text field holds a fixed tag set: `<b> <i> <u> <s> <br> <a href> <span data-c="@primary|#hex">`.
- **Site**: `public-site/lib/inlineText.ts` provides `inline(text, {links})` and `plainText()`.
  - It parses tag by tag into React elements. Nothing is ever `dangerouslySetInnerHTML`. Unknown tags and attributes stay text; links go through `safeLink`, colours through `colorCss`.
  - `<strong>` and `<em>` get `color:inherit`, because templates colour their own `<strong>` (hero bold text was invisible without it).
  - Every former `autolink(...)` in both templates is now `inline(...)`. Inside cards that are themselves links it is `inline(x, {links:false})`. ContactFormBlock and PollBlock are covered.
  - Plain-text spots (breadcrumb, aria-label, ListExport title) use `plainText`.
- **Studio**: `components/InlineRichField.tsx` is a contenteditable with a small bar: B I U S, link, colour (theme tokens + hex), clear; keys Ctrl+B/I/U/K; paste is plain text only.
  - `lib/inlineMarkup.ts` provides `toEditorHtml` (stored text → safe editor HTML) and `serialize` (editor DOM → stored subset; maps `<font>`, `<div>`, bold styles, rgb() colours).
  - It is used in `BlockComponents` `FieldInput` for `RICH_FIELD_KEYS`: heading, subheading, eyebrow, kicker, lead, intro, introLead, introHeading, formHeading, panelHeading, body.
  - **Item `title` is deliberately excluded**: many templates render item titles raw or inside `<a>`, so tags would show as text.
- **Agent**: the `update_block` description lists the allowed tags and says to keep tags when translating.
- **Tests**: `public-site/lib/inlineText.test.ts` and `webx-studio/tests/inline-markup.test.ts`.

Files: `public-site/lib/inlineText{,.test}.ts`, `public-site/templates/{_builder/HarnessBridge.tsx, orst/Blocks.tsx, orst/ContactFormBlock.tsx, orst/PollBlock.tsx, royalsociety/Blocks.tsx}`, `webx-studio/components/{InlineRichField.tsx, LayersPanel.tsx, VisualBuilder.tsx, BlockComponents.tsx, blockPreview/RealPreview.tsx}`, `webx-studio/lib/{inlineMarkup.ts, agent/tools.ts, i18n.ts}`, `webx-studio/app/globals.css`, `webx-studio/tests/inline-markup.test.ts`.

Last results: Studio `npm test` **530 pass**, public-site `npm test` **454 pass**. `tsc --noEmit` is clean in both; the 3 `leaflet/*.png` module errors in Studio are pre-existing and expected.

## 5. Open items

1. Nothing is left uncommitted from these two days.
2. **Add model needs a gateway DB.**
   - Today `canAdd=false` and Save is disabled with an explanation.
   - Enabling it means changing docker-compose (not `config.yaml`): `STORE_MODEL_IN_DB=True`, a `DATABASE_URL`, and a `litellm` database in the existing Postgres.
   - **The user has not approved this yet.** Ask first.
3. **Published pages need re-publishing** to show the new rendering on 8090 (auto-links, inline formatting, hero picture, picture position).
4. Remaining Figma gaps the user may ask for next (from the comparison):
   - free placement of any element;
   - linked reusable components (edit once, change everywhere);
   - smart guides, snap and align/distribute;
   - drag handles for auto-layout padding/gap;
   - interactions (sticky, popups, scroll effects);
   - custom breakpoints / side-by-side views;
   - variables with modes;
   - live multiplayer and canvas comments;
   - image filters and crop.
   The user said vector/blend/dev-mode/multiplayer are not worth it for this CMS.
5. Agent gaps outside the page editor: A/B test, page templates, uploading a custom icon (Material icons work), Branding / site fonts, menus.
6. Item titles cannot take inline formatting yet. Converting the remaining raw `{it.title}` renders, including those inside `<a>`, would allow it.
7. Older, still open:
   - a Review on page 12 ("(English blocks)", stage `changes`) blocks publishing page 12;
   - "ultrasmooth" is literally in the ORST home hero heading (content, not code);
   - "Untitled Post" drafts 112/114/115/116;
   - a Moonshot key was once pasted in chat and should be rotated;
   - OpenShift deploy is waiting on DNS/cluster answers;
   - Excel import is unsupported.

## 6. How to test (what worked well)

- **Unit**: `cd webx-studio && npm test` (node:test + tsx, `tests/**/*.test.ts`, the fake CMS is `tests/harness/fakeCms.ts`); `cd public-site && npm test`.
- **Real browser**: Playwright from `e2e/node_modules` via `createRequire("…/e2e/package.json")("playwright")`.
  1. Log in with `ctx.request.post("/api/auth/login", …)`.
  2. Set `localStorage webx_agent_open = "0"`.
  3. Open `/builder`; the ORST home page opens by default.
  4. Reach the preview with `page.frameLocator("iframe")` (or `(await page.$("iframe")).contentFrame()`).
  - Useful test ids: `vb-undo`, `vb-redo`, `layers-panel`, `layer-block-N`, `layer-comp-<key>`, `layer-lock-comp-<key>`, `layer-eye-…`, `layer-style`, `rich-<field>` (+ `irf-bold`, `irf-link`, `irf-colour`, `irf-c-<token>`), `cs-imgpos`, `cs-imgzoom`, `vbh-pan`, `vbh-zoom-in`.
  - **Undo everything at the end; never press Save/Publish in a test.**
- **Scratch pages** for anything that writes:
  1. `POST /api/cms/entries/wp:page {title, blocks}`.
  2. Do the work. For the live agent, `POST /api/agent/run {message, image?, lang:"th", mode:"docked", context:{kind:"page", uid:"wp:page", docId, applyLocally:false}}` and read the SSE stream (`event: tool_call | tool_result | text | proposal | error`).
  3. Clean up afterwards: delete its reviews (`api::review.review`), its page versions (`api::page-version.page-version` with that `documentRef`), any uploaded media (`DELETE /api/cms/media/<id>`), then the page.
- **Layer coverage audit**:
  1. Open a page on `localhost:3000` that holds an iframe to `localhost:3100/<tpl>/preview`.
  2. For each block, post `{type:"webx:builder:render", blocks, active:k}`. The pages' blocks come from the public `http://localhost:8081/wp-json/wp/v2/pages?per_page=100&_fields=id,slug,acf`.
  3. Read the reported layers and list the visible text/images not inside any `data-vb-c` or `data-vb-layer`.

## 7. Gotchas

- **Shell quoting mangles backslashes and quotes.** Regexes in `node -e` / heredocs lost their `\`, and a heredoc containing `'` broke the shell. Write patch scripts with the Write tool into the scratchpad and run them with `node`; use Edit for small fixes.
- `GET /api/health` on Studio answers **401** when not logged in. Don't wait for 200.
- `docker exec` with `/` paths on Git Bash needs `MSYS_NO_PATHCONV=1`. Thai text inside `curl -d` gets mangled; use a Node script.
- The Studio `.env` is read by scripts directly; keep keys out of output.
- `/orst/news` on 8090 is a 301: use `curl -L`.
- The Visual Builder renders inside a scaled iframe. `getBoundingClientRect` includes CSS transforms (zoomed pictures use `unscaledRect` in the harness).
- `i18n.ts` keys must be unique (`rt.*` already existed for the rich-text editor; the word-formatting keys are `rt.wordLink` / `rt.wordClear` etc.).
