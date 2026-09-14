# marketing-site

The public marketing website for WebX (webx.io). Bilingual — Thai at the
root, English under `/en`. Static export (`next build` → `out/`), no server.

## Run

```bash
npm install
npm run dev        # http://localhost:3200
npm run build      # static export to out/
npm run start      # serve out/ locally
```

## Where things live

- **All copy, both languages: `lib/i18n.ts`.** One dictionary, one shape;
  `en` is the type source of truth, so a key missing from `th` is a compile
  error. Components contain no user-facing strings.
- **Routes: `app/`** — `/`, `/pricing`, `/privacy`, and the `/en` mirror of
  each. Every route is a one-line wrapper around a component in `components/`.
- **Product screenshots: `public/shots/`** — regenerate with `npm run shots`
  (see below). Captioned by feature-card *id*, not array index, in
  `components/Home.tsx`.

## Build-time config

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_STUDIO_URL` | **yes, in production** | Every "Start free" / "Sign in" CTA. A production build **fails** without it (`lib/config.ts`) rather than silently shipping localhost links. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | yes, in production | Contact / compliance-dossier / privacy mailto links. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical + Open Graph base (`lib/meta.ts`). Defaults to `https://webx.io`. |

Dev defaults (`localhost:3001`, `hello@webx.io`) apply only when
`NODE_ENV !== "production"`.

## Screenshots

`npm run shots` logs into a running WebX Studio and captures the dashboard,
builder and analytics screens. **It must use the fictional showcase tenant**
(`webx-showcase`, "เทศบาลตัวอย่าง"), never a real customer's workspace —
the site once shipped a real agency's org name and a real login email in
its hero image. Credentials come from `SHOT_EMAIL` / `SHOT_PASSWORD`
(gitignored `.env.local`); there is deliberately no password default.

## Keeping the copy honest

Every product claim in `lib/i18n.ts` was fact-checked against the codebase
on 2026-09-12 (see the root `WebX-audit-2026-09-12.md`). When a feature
changes, change the copy in the same PR. Things that have burned us:
listing an SSO protocol we don't support, an `llms.txt` nothing generated,
a "restore drill" that was a script no one ran.
