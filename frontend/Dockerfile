# syntax=docker/dockerfile:1

# Frontend image: builds the PWA and serves it with nginx, which also proxies
# /api and /uploads to the backend so the browser only talks to one origin.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
ENV CYPRESS_INSTALL_BINARY=0
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-frontend,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY . .
# Relative, so the app calls the nginx that serves it. Override for a separate API host.
ARG VITE_API_URL=/api/v2
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
