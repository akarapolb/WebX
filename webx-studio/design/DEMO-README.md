# WebX Studio — interactive product demo

Single-file, self-contained HTML demo of **WebX Studio**, a unicorn-grade multi-tenant
headless CMS backoffice. No build step, no backend — open `index.html` in any browser.
(Strapi stays the real headless backend in production; this is the UI/UX prototype to
port to Next.js.)

## Run
- Open `index.html` directly (file://), **or**
- `python -m http.server 8090 --directory webx-studio` → http://localhost:8090

## What it proves
- **Multi-tenant = a token swap.** Switch tenant (Aurora Gov / Nimbus Retail / Vertex
  Health) → the entire app + a live public-site preview recolor instantly, zero layout change.
- **AI-native.** Ask-your-data on the dashboard, AI Smart Search with cited sources +
  GEO/AEO note, and AI assist that drafts content in the editor.
- **Keyboard-first DX.** ⌘K / Ctrl+K command palette, number keys 1–8 jump between views.
- **Bilingual EN / ไทย.** Everything switches — nav, content, AI answers, toasts.
- **Light / dark**, premium Linear/Vercel-grade visual language.
- **Security story.** Notes the BFF / httpOnly-cookie model + enforced MFA.

## 90-second pitch choreography
1. **Splash** — "Headless CMS, reimagined." Press **Enter Studio**.
2. **Dashboard** — KPIs + live traffic. Click **Ask** on *Ask your data* → AI types an
   answer, bars animate. "Your data, answerable in ten seconds."
3. Press **⌘K** → type "go" → jump to **AI Search**. Click a suggestion chip → AI answer
   types in, citing *Guide.pdf (full-text)*. "Answers grounded in your own content — and
   exposed to external AI via Schema.org + llms.txt."
4. Open the **tenant switcher** → pick **Nimbus Retail**. Whole platform + the public-site
   preview recolor. "Multi-tenant isn't a feature here — it's the core. Theming is one token set."
5. Press **6 → Branding**. Click an accent swatch, toggle the watermark. "Marketers
   re-skin the live site with no code, no deploy."
6. Press **5 → Visual Builder**. Drag/click a block into the page. "Composable landing
   pages, published to the edge in one click."
7. Toggle **ไทย**. Everything flips to Thai instantly. Toggle the **theme** to light. Close.

## Files
- `index.html` — the deliverable (concatenated, ~82 KB).
- `_build/part1|2|3.html` — source parts (CSS / markup / script). Edit a part, then
  `cat _build/part1.html _build/part2.html _build/part3.html > index.html`.

> DEMO · SIMULATED DATA — fictional tenants and metrics; nothing connects to a live system.
