# ---------------------------------------------------------------------------
# ELBAKRI OVERSEAS — Operations API
#
# Multi-stage build. The runtime image carries only production dependencies,
# the compiled output and the Prisma schema plus its committed migrations —
# `prisma migrate deploy` runs at start-up, never `db push`.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# --- dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
# The API image does not need the web workspace's dependency tree.
RUN npm ci --workspace @elbakri/shared --workspace @elbakri/api --include-workspace-root

# --- build -----------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN npm run build --workspace @elbakri/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build --workspace @elbakri/api

# Drop dev dependencies from the tree that ships.
RUN npm prune --omit=dev --workspace @elbakri/shared --workspace @elbakri/api --include-workspace-root

# --- runtime ---------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=4000

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

# Private storage for uploaded workbooks and attachments.
RUN mkdir -p /app/storage && chown -R app:app /app/storage
USER app

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

WORKDIR /app/apps/api
# Migrations are applied from committed files before the server accepts traffic.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
