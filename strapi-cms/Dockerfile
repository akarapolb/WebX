# Strapi 5 CMS — build admin + compile, run in production. Debian slim so native
# deps (better-sqlite3 / sharp) build reliably; prod uses Postgres via DATABASE_*.
FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=1337
# carry the fully-built app (dist/build/admin + native node_modules), owned
# by the base image's own non-root `node` user (uid 1000) instead of root —
# found running as root in a full-codebase audit (2026-09-12): the one
# Dockerfile in this repo with no USER stanza (webx-studio's own already
# has one, same pattern). Strapi's only writable path in production is
# public/uploads (the strapi-uploads volume mounted there in
# docker-compose.yml) — --chown here means that directory's ownership
# inside the image is `node`, which the volume then inherits on first
# creation (Docker copies a fresh named volume's mount point in from the
# image, ownership included).
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 1337
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://localhost:1337/_health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start"]
