# Deployment

## Docker

The repository root has a Compose stack: an nginx container that serves the PWA and proxies `/api` and
`/uploads` to the backend container, and the backend with a named volume for its SQLite file and the uploaded
images. The browser only talks to nginx, so no CORS configuration is needed.

```bash
cp .env.docker.example .env      # set JWT_SECRET and JWT_REFRESH_SECRET (openssl rand -hex 48)
docker compose up -d --build
# → http://localhost:8080 (HTTP_PORT in .env changes it)
```

| Piece | Details |
|-------|---------|
| `backend/Dockerfile` | Multi-stage: build with pnpm, prune to production dependencies, runtime on `node:22-bookworm-slim` with Playwright Chromium for the shop scrapers, runs as the `node` user, health check on `/api/v2/health/ready` |
| `frontend/Dockerfile` | Builds the app with `VITE_API_URL=/api/v2` (relative), serves it from `nginx:1.27-alpine` |
| `frontend/nginx.conf` | Static files with long caching for hashed assets and `no-cache` for `index.html` and `sw.js`, `/api/` proxy with buffering off (server-sent events), `/uploads/` proxy with a long cache, 12 MB upload limit, `X-Forwarded-Proto` passed through |
| Volumes | `plantcare-data`: `/data/plantcare.db` and `/data/uploads`, migrations run on start; `plantcare-logs`: the winston file logs (`error.log`, `combined.log`), the same entries go to stdout for `docker compose logs` |
| Secrets | Only through `.env` (gitignored); compose refuses to start without the two JWT secrets |

Operations:

```bash
docker compose logs -f backend                      # follow the API log
docker compose pull && docker compose up -d --build # update after a git pull
docker compose stop backend    # the SQLite file is in WAL mode: stop before copying it
docker run --rm -v plantcare_plantcare-data:/data -v "$PWD":/backup alpine tar czf /backup/plantcare-data.tgz -C /data .
docker compose start backend
```

For public use put a TLS-terminating reverse proxy (Caddy, Traefik, another nginx) in front of the frontend
container and forward `X-Forwarded-Proto`; the backend then sets the `Secure` flag on the refresh cookie. Set
`PUBLIC_BASE_URL` when that proxy rewrites the `Host` header. Back up the volume before an upgrade: migration
`0002` deletes orphan image rows and files. CI builds both images and smoke tests the running stack (health,
registration, login, an authenticated read) on every push.

### Migrating a PM2 deployment

`scripts/migrate-pm2-to-docker.sh` moves an existing PM2 installation (Linux or macOS server) to the Docker
stack, including its data, from a checkout of this repository:

```bash
scripts/migrate-pm2-to-docker.sh --dry-run                 # print the plan, change nothing
scripts/migrate-pm2-to-docker.sh --backend-dir /srv/plantcare/backend --http-port 8080
```

| Step | What happens |
|------|--------------|
| Docker | Installs Docker Engine and the Compose plugin when they are missing (the official `get.docker.com` script on Linux, the package manager for the plugin; asks first, needs root or sudo; on macOS it asks you to install Docker Desktop) |
| Environment | Reads the old `backend/.env` (never sources it) and writes the compose `.env` from it: JWT secrets, token lifetimes, OpenAI key, `ALLOWED_ORIGINS`, `PUBLIC_BASE_URL`. An existing `.env` is kept unless `--force` |
| Stop and back up | Builds the images first, then stops the PM2 app so the SQLite file is consistent, and copies the database (including WAL files) and the old `.env` to a backup directory (`~/plantcare-migration-<time>`, mode 700) |
| Copy | Copies the database and the uploads folder into the `plantcare-data` volume with a throwaway container; the old folders are mounted read-only and stay untouched. It refuses a volume that already holds a database unless `--force` |
| Verify | Compares row counts (users, plants, watering records, substrates, components, images) and uploaded file counts between old and copied data, starts the stack and waits for the health checks through nginx |
| Safety | If a step fails before the new stack is verified, the PM2 app is started again. `--remove-pm2` deletes the PM2 app and runs `pm2 save` after a verified migration; without it the app stays stopped |

Options: `--env-file`, `--pm2-name` (default `plantcare-backend`), `--backup-dir`, `--skip-docker-install`,
`--yes`. Image URLs stored with an absolute origin are converted to relative paths by the backend migrations
on its first start. A reverse proxy on the host that pointed to port 5000 must point to the new HTTP port
instead. CI runs the whole migration against a PM2 managed backend with real data on every push.

The sections below describe running the backend without Docker.

## Production Build

TypeScript is compiled to JavaScript before deployment. The output goes to `./dist/`.

```bash
pnpm run build
# → dist/server.js + type declarations + source maps

pnpm run start
# → node dist/server.js (via scripts/start.js)
```

Set `NODE_ENV=production` before starting. This disables debug logging, removes stack traces from error responses, and enables production CORS enforcement. The PM2 ecosystem file defaults to production.

## Environment Checklist

Go through this before every production deployment:

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` — at least 32 random characters, never committed to version control
- [ ] `JWT_REFRESH_SECRET` — separate value from `JWT_SECRET`
- [ ] `DB_PATH`: points to persistent storage; back up the database file and the uploads folder before each release (some releases add data migrations)
- [ ] `ALLOWED_ORIGINS` — restricted to your actual frontend domain(s)
- [ ] `NAS_PATH` — points to persistent storage, not ephemeral container filesystem
- [ ] `PUBLIC_BASE_URL`: set to the public API origin when a proxy rewrites the Host header
- [ ] `OPENAI_API_KEY` — set if the `/more-info` endpoint is needed
- [ ] Migrations: they are applied automatically at startup; check the log for `Applied migration` lines after an upgrade
- [ ] Playwright Chromium installed — run `pnpm exec playwright install chromium` if using the sales scraper

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Process Management with PM2

PM2 keeps the process alive and restarts it on crash:

```bash
# Install globally
pnpm add -g pm2

# Start server
pm2 start dist/server.js --name plantcare

# Save process list (survives reboots)
pm2 save

# Register startup script
pm2 startup

# View logs
pm2 logs plantcare

# Reload without downtime (re-reads env variables)
pm2 reload plantcare
```

For a zero-downtime deployment with environment variables:

```bash
pm2 reload plantcare --update-env
```

## Health Checks

Two endpoints are available for monitoring and orchestration:

```
GET /api/v2/health
→ { "status": "ok", "uptime": "0d 0h 20m 34s", "uptime_s": 1234, "db": "connected", "version": "v2" }
→ 503 if DB is unreachable

GET /api/v2/health/ready
→ { "ready": true }
→ 503 if DB is unreachable
```

**Kubernetes / Docker usage:**
- Use `/api/v2/health/ready` for **readiness probes** — prevents traffic before the DB is reachable
- Use `/api/v2/health` for **liveness probes** — restarts the container if the server is stuck

**Example Kubernetes probe config:**

```yaml
readinessProbe:
  httpGet:
    path: /api/v2/health/ready
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10

livenessProbe:
  httpGet:
    path: /api/v2/health
    port: 5000
  initialDelaySeconds: 15
  periodSeconds: 30
```

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` (Ctrl+C) gracefully:

1. Stops accepting new HTTP connections
2. Closes the Playwright Chromium browser instance
3. Closes the SQLite database (WAL checkpoint via `closeDb()`)
4. Exits with code `0`

If shutdown takes longer than 10 seconds, the process force-exits with code `1`.

PM2 sends `SIGTERM` before killing a process, so graceful shutdown works automatically with `pm2 reload` and `pm2 stop`.

## Static File Serving

Uploaded images are served from the `uploads/` directory (or `NAS_PATH` if set) via `@fastify/static`:

```typescript
await app.register(fastifyStatic, { root: uploadDir, prefix: '/uploads/', decorateReply: false });
```

For production, consider serving uploads through **nginx** instead:

```nginx
location /uploads {
    alias /mnt/nas/plantcare/uploads;
    expires 24h;
    add_header Cache-Control "public";
}
```

This offloads static file serving from Node.js and enables kernel-level sendfile optimization.

## Reverse Proxy (nginx)

Example nginx config:

```nginx
server {
    listen 443 ssl;
    server_name api.yourapp.com;

    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        chunked_transfer_encoding on;
    }

    location /uploads {
        alias /mnt/nas/plantcare/uploads;
        expires 24h;
        add_header Cache-Control "public";
    }
}
```

The `proxy_buffering off` setting is critical for SSE — nginx buffers responses by default, which breaks the real-time stream.

## Logging

Logs are written to `./logs/` (relative to the working directory):

- `logs/error.log` — error-level entries only
- `logs/combined.log` — all levels

In development, logs are also printed to stdout with color and human-readable timestamps.

Every log line includes the `requestId` from `AsyncLocalStorage`, making it possible to trace a single request across multiple log entries:

```
14:23:01 | [info] [a1b2-c3d4] {PlantsController}: Plant created | {"plantId":7}
14:23:01 | [info] [a1b2-c3d4] {SQLitePlantRepository}: INSERT executed | {"affectedRows":1}
```

---

← [Testing](./testing.md) · **Next:** [Roadmap](./roadmap.md)
