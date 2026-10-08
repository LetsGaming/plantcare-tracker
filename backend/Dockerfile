# syntax=docker/dockerfile:1

# Backend image: builds the TypeScript API, keeps production dependencies only
# and ships Chromium for the shop scrapers that need a rendered page.
# Data (SQLite file and uploaded images) lives in the /data volume.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
RUN corepack enable
WORKDIR /app

FROM base AS deps
# Prebuilt binaries exist for better-sqlite3 and sharp on glibc, the toolchain is the fallback.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-backend,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json tsconfig.build.json server.ts ./
COPY src ./src
RUN pnpm run build

FROM deps AS prod-deps
RUN pnpm prune --prod

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
  PORT=5000 \
  DB_PATH=/data/plantcare.db \
  NAS_PATH=/data/uploads \
  PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Chromium and its system libraries, installed as root before dropping privileges.
RUN node node_modules/playwright/cli.js install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /app/logs \
  && chown -R node:node /data /app/logs

USER node
VOLUME ["/data", "/app/logs"]
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v2/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
