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
# carry the fully-built app (dist/build/admin + native node_modules)
COPY --from=build /app ./
EXPOSE 1337
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://localhost:1337/_health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start"]
