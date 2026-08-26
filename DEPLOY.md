# Deploying WebX Studio

Two supported paths. Pick by audience:

| Path | Best for | What you run |
|---|---|---|
| **A. Docker Compose** | self-host, on-prem, DGA / air-gapped, a quick full-stack demo | one host, `docker compose up` |
| **B. Managed (Vercel + hosted Strapi)** | public SaaS demo, zero ops | Vercel for the admin, a Strapi host + Postgres |

Both use **Postgres + pgvector** in production (SQLite is dev-only).

---

## A. Docker Compose (full stack)

Brings up Postgres+pgvector, Strapi, WebX, and (optionally) the LiteLLM gateway.

```bash
cp .env.production.example .env
# fill DATABASE_PASSWORD + the 5 Strapi secrets:
node -e "for(const k of['APP_KEYS','API_TOKEN_SALT','ADMIN_JWT_SECRET','TRANSFER_TOKEN_SALT','JWT_SECRET'])console.log(k+'='+require('crypto').randomBytes(16).toString('base64'))"
# (APP_KEYS wants 2+ comma-separated keys — run twice and join with a comma)

docker compose up -d --build              # db + strapi + webx
docker compose --profile ai up -d --build # also start LiteLLM
```

- WebX → http://localhost:3000  ·  Strapi admin → http://localhost:1337/admin
- First run: open the Strapi admin and create the first admin user.
- AI: set `LITELLM_URL=http://litellm:4000` (+ a provider key) in `.env`, or
  leave it empty — every AI feature degrades gracefully.
- RAG at scale: set `WEBX_VECTOR=pgvector` and `PGVECTOR_URL` to the bundled db.

Services declare `healthcheck`s; `docker compose ps` shows health. Uploads and
DB persist in named volumes (`strapi-uploads`, `db-data`).

---

## B. Managed (Vercel + hosted Strapi)

1. **Strapi** — deploy `strapi-cms/` to a Node host (Render / Railway / a VM)
   with a managed **Postgres** (enable the `pgvector` extension). Set
   `DATABASE_CLIENT=postgres` + `DATABASE_URL` and the five Strapi secrets.
2. **WebX** — import `webx-studio/` into **Vercel**. Set `STRAPI_URL` to the
   Strapi URL, plus `LITELLM_*` / `WEBX_VECTOR` / `PGVECTOR_URL` as needed.
   `output: "standalone"` is already set; Vercel builds it directly.
3. **LiteLLM** (optional) — run as its own service (Render/Fly) with a Redis
   cache; point `LITELLM_URL` at it. Mint per-tenant virtual keys with budgets.

---

## Production checklist

- [ ] All five Strapi secrets + `DATABASE_PASSWORD` set to strong random values.
- [ ] HTTPS/TLS terminated in front (reverse proxy / platform).
- [ ] CORS + trusted proxy configured for the public WebX origin.
- [x] Backups: nightly `pg_dump` + the uploads volume — the `db-backup` service, local disk only (see `BACKUP_KEEP`/`BACKUP_INTERVAL_SECONDS` in `.env.production.example`). Off-site storage is still on you.
- [ ] Least-privilege Strapi API token for the MCP/CLI (review find/create only
      if those tools are used).
- [ ] PDPA: submission content types are **not** public-readable (verify roles).
- [ ] Cookie TTLs match Strapi `auth.sessions.*` lifespans.

## DGA / government on-prem notes

- Self-host path **A** keeps everything inside the agency network — no third-party
  hop, which matters for PDPA. Point AI at a **local model** (`webx-local`/Ollama)
  for sensitive tenants.
- **DR (RTO/RPO):** run a warm standby — stream Postgres WAL to the DR site and
  replicate the uploads volume; the stack is stateless apart from db + uploads,
  so failover is "point DNS at the standby". (TOR Security: DR site.)
- Penetration test before go-live (TOR งวด 4); the BFF token isolation,
  field-RBAC, rate-limiting, and PDPA role checks are the surfaces to validate.
