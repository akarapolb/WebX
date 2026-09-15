# WebX Studio (Next.js BFF) — multi-stage, standalone output.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
# Next.js's standalone server.js binds to $HOSTNAME if set, defaulting to
# 0.0.0.0 otherwise — but Docker always sets HOSTNAME to the container's own
# id, so without this override the server only listens on that container's
# bridge-network IP, never on localhost/127.0.0.1. That breaks both this
# image's own HEALTHCHECK below (curl/wget against localhost) and any
# loopback-based debugging inside the container, on every deployment of this
# image, not just this one — found while bringing this stack up fresh.
ENV HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# standalone server + static assets only (no node_modules, no source)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER nextjs
EXPOSE 3000
# 127.0.0.1, not localhost: this Alpine image resolves "localhost" to ::1
# first, but the server only listens on IPv4 (0.0.0.0) — wget tried ::1,
# got connection refused, and never fell back to the working IPv4 address.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
