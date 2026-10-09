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
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Prebuilt binaries exist for better-sqlite3 and sharp on amd64 and arm64 (glibc), so the
# compiler toolchain, which costs minutes on a small machine, is installed only when they are missing.
RUN --mount=type=cache,id=pnpm-backend,target=/pnpm/store \
  pnpm install --frozen-lockfile \
  || (apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && pnpm install --frozen-lockfile)

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

# The headless shell (all the scrapers need) and its system libraries, installed as root before dropping
# privileges. This layer only depends on node_modules, so code updates reuse it instead of downloading
# the browser again.
RUN node node_modules/playwright/cli.js install --with-deps chromium-headless-shell \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /app/logs \
  && chown -R node:node /data /app/logs

# Plant recognition model (DINOv2 small, quantised), pinned by checksum.
ADD --checksum=sha256:c179f8f7f592449c4c1bca4cd124a7538021428c5ffb89afde9503935b197efb   https://huggingface.co/onnx-community/dinov2-small/resolve/main/onnx/model_quantized.onnx   /app/models/dinov2-small-q8.onnx
RUN chmod 644 /app/models/dinov2-small-q8.onnx
ENV RECOGNITION_MODEL_PATH=/app/models/dinov2-small-q8.onnx

COPY --from=build /app/dist ./dist

USER node
VOLUME ["/data", "/app/logs"]
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v2/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
