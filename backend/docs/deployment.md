# Deployment

## Docker

The repository root has a Compose stack: an nginx container that serves the PWA and the uploaded images and proxies `/api` to the backend container, and the backend with a named volume for its SQLite file and the uploaded
images. The browser only talks to nginx, so no CORS configuration is needed.

```bash
cp .env.docker.example .env      # set JWT_SECRET and JWT_REFRESH_SECRET (openssl rand -hex 48)
docker compose up -d --build
# → http://localhost:8080 (HTTP_PORT in .env changes it)
```

| Piece | Details |
|-------|---------|
| `backend/Dockerfile` | Multi-stage: build with pnpm, prune to production dependencies, runtime on `node:22-bookworm-slim` with Playwright Chromium for the shop scrapers, runs as the `node` user, health check on `/api/v2/health/ready` |
| `frontend/Dockerfile` | Builds the app with `VITE_API_URL=/api/v2` (relative), precompresses the build with `scripts/precompress.mjs` (`.gz` and `.br` siblings next to every js, css, html, json and svg file of 1 KB or more) and serves it from `nginx:1.27-alpine` |
| `frontend/nginx.conf` | See [nginx in the Docker stack](#nginx-in-the-docker-stack) below |
| Volumes | `plantcare-data`: `/data/plantcare.db` and `/data/uploads`, migrations run on start; the frontend container mounts the same volume read-only at `/data` to serve `/uploads` itself; `plantcare-logs`: the winston file logs (`error.log`, `combined.log`, each rotated at 10 MB with 5 files kept), the same entries go to stdout for `docker compose logs` |
| Limits | `mem_limit` 1536m (backend) and 128m (frontend), the backend runs with `NODE_OPTIONS=--max-old-space-size=384` and `UV_THREADPOOL_SIZE=8`, both containers rotate their Docker logs (10 MB, 3 files) |
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

### nginx in the Docker stack

`frontend/nginx.conf` does five jobs:

| Location | Behaviour |
|----------|-----------|
| `/uploads/` | Served by nginx itself from the data volume (`alias /data/uploads/`), not proxied. `Cache-Control: public, max-age=31536000, immutable` (stored files are never rewritten under the same name), `open_file_cache`, no access log. The backend container must create files readable by the nginx worker user (default umask: files 0644, directories 0755); with a restrictive umask proxy `/uploads/` to the backend instead |
| `/api/v<N>/sales` and `/api/v<N>/more-info` | The server-sent-event streams: `proxy_buffering off`, `proxy_cache off`, `proxy_read_timeout 3600s`. Exactly these two paths; `/sales/summary`, `/sales/:id` and `/sales/health` are ordinary buffered requests |
| `/api/` | Everything else, buffered, 60 s read timeout. The backend's `ETag` and `Cache-Control: private, no-cache` pass through untouched |
| `/assets/`, `workbox-*.js` | Hashed files, one year, `immutable` |
| `index.html`, `sw.js` | `no-cache` so a new build is picked up |

Compression: `gzip_static on` serves the precompressed `.gz` files, `gzip on` (level 5, `Vary: Accept-Encoding`) compresses the rest. The build also writes `.br` files, but stock `nginx:alpine` has no brotli module, so they are used only with a brotli-enabled image. The security headers are repeated in every location that sets its own `add_header` (nginx does not inherit them otherwise), and the backend's copies are hidden so no header is sent twice. The stack speaks HTTP/1.1; terminate TLS and HTTP/2 at the proxy in front of it.

The backend's own `/uploads` handler (`@fastify/static`, one-year immutable cache) stays active and serves the same files when the backend runs without this nginx.

### Upgrading to the performance release

Back up the volume first. What happens on the first start of the new version:

| Change | Effect |
|--------|--------|
| Migrations `0006` to `0010` | `0006` replaces the list indexes (keyset paging, partial indexes for public rows); `0007` adds `width`, `height`, `placeholder` and `variants` to `images`; `0008` creates the sales tables (`sales_items`, price points, source state); `0009` creates `sessions`; `0010` rebuilds the watering history index. They run in seconds on a normal database and are forward-only |
| Sessions are persisted | Login sessions now live in the `sessions` table instead of memory. Tokens issued by the previous version carry no session id and answer `401`, so **every user signs in once again** after the upgrade. After that, sessions survive restarts |
| Sales start empty | Scraping moved to a background refresher that stores results in the database. Right after the first start the Sales tab is empty until the first refresh finishes (the warm-up begins `SALES_REFRESH_WARM_DELAY_MS` after listen and takes a few minutes). `GET /sales/summary` reports `refreshed_at: null` until then |
| Existing images have no variants | Old images keep working as single files; the app falls back to the full size. Create the variants once, see below |
| API shapes changed | Lists are paged envelopes, dates are epoch milliseconds, watering writes return summaries, the image resize route is gone. Deploy backend and frontend together; an old cached frontend (service worker) updates itself on the next load |

### Image variants

New uploads get three webp files (160, 480 and 1024 px). Images stored earlier are converted by the backfill, which only reads and writes files and updates `images.variants`:

```bash
pnpm run images:backfill -- --dry-run     # count what would be converted, write nothing
pnpm run images:backfill                  # convert, 50 images per batch
pnpm run images:backfill -- --batch 200   # batch size 1 to 1000
```

The run can be interrupted and started again: a row is updated only after its files exist. Images whose file is missing or is not a webp are marked `variants = -1` and skipped from then on; a transient read error leaves the row for the next run. The production Docker image has no `tsx`, so there set `IMAGE_BACKFILL_ON_START=true` for one start instead (default `false`): the same pass runs in the background after the server listens, yields to the event loop between images and stops on shutdown. Set it back to `false` once the log says it finished.

### Maintenance jobs and the database file

The backend runs periodic jobs in the background: expired sessions and SSE tickets are swept, long inactive sales items and old price points are pruned (also when `SALES_REFRESH_ENABLED=false`), and `.webp` files directly inside the `plant`, `substrate` and `component` upload folders that no image row references and that are older than a day are removed together with their variants. The sweep refuses to delete anything when no image row exists at all, or when it would remove more than half of 20 or more files, and logs why. To reclaim free pages in the SQLite file after large deletions, stop the server and run `pnpm run db:vacuum` (it needs temporary disk space as large as the database).

### Memory and reverse-proxy settings

- The backend is sized for a small host: about 384 MB of V8 heap inside a 1.5 GB container limit. Chromium (sales scraping) starts on demand and is closed after 10 idle minutes; the recognition model loads after the port opens.
- `TRUST_PROXY_HOPS` (default `1`) must equal the number of reverse proxies between the client and the backend. The Docker stack has one (the bundled nginx); add one for a TLS proxy in front of it. A value that is too high lets clients spoof `X-Forwarded-For` and bypass the per-IP rate limits.
- `LOG_TO_STDOUT=true` skips the log files entirely, for platforms that collect stdout.
- The new variables (`SALES_*`, `IMAGE_BACKFILL_ON_START`, `UPLOAD_MAX_PIXELS`, `LOG_TO_STDOUT`, `TRUST_PROXY_HOPS`) are listed in [Setup](./setup.md); `docker-compose.yml` does not forward them yet, add them to the backend `environment` block to change a default.

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
| Port check | Fails before the long build when the HTTP port is taken by something other than the old PM2 frontend app (`--pm2-frontend-name`, default `plantcare-frontend`, which serves on 8080 by default and is stopped right before the new stack starts); pick another port with `--http-port` |
| Stop and back up | Builds the images first, then stops the PM2 app so the SQLite file is consistent, and copies the database (including WAL files) and the old `.env` to a backup directory (`~/plantcare-migration-<time>`, mode 700) |
| Copy | Copies the database and the uploads folder into the `plantcare-data` volume with a throwaway container; the old folders are mounted read-only and stay untouched. It refuses a volume that already holds a database unless `--force` |
| Verify | Compares row counts (users, plants, watering records, substrates, components, images) and uploaded file counts between old and copied data, starts the stack and waits for the health checks through nginx |
| Safety | If a step fails before the new stack is verified, the PM2 apps are started again and the containers and the data volume this run created are removed, so a rerun starts clean. `--remove-pm2` deletes the PM2 app and runs `pm2 save` after a verified migration; without it the app stays stopped |

Options: `--env-file`, `--pm2-name` (default `plantcare-backend`), `--backup-dir`, `--skip-docker-install`,
`--yes`. Image URLs stored with an absolute origin are converted to relative paths by the backend migrations
on its first start. A reverse proxy on the host that pointed to port 5000 must point to the new HTTP port
instead. CI runs the whole migration against a PM2 managed backend with real data on every push.

The sections below describe running the backend without Docker.

## Updating an installation

After this release `git pull` never needs a manual merge for settings: they live in the gitignored `.env`
files, and `frontend/src/config.json` no longer exists. Frontend settings are `VITE_API_URL`, `VITE_APP_TITLE`
and `VITE_CACHE_EXPIRE_HOURS`; the former `base_url`, `base_path` and `api_version` of the production block
become one `VITE_API_URL`, for example `http://plants.lan.net/api/v2`. Leave it empty when the API is served on
the same origin as the app (`/api/v2`).

Once, on a checkout whose `frontend/src/config.json` (or another tracked file) was edited locally, git refuses
to pull. Note your values, set the local edits aside, pull and drop them:

```bash
git stash && git pull && git stash drop
pnpm --dir backend install && pnpm --dir frontend install    # every update: dependencies change
cd frontend && pnpm run build      # creates frontend/.env; put your VITE_API_URL there and build again
pm2 restart plantcare-backend      # PM2: the start script completes backend/.env with any new settings
```

Run `pnpm install` in both packages after every pull that changes a `package.json` or lockfile. If you forget,
`pnpm run dev`, `pnpm run build` and the PM2 start stop with `[deps] N dependencies are not installed ... Run:
pnpm install` instead of failing with a wall of type errors (`PLANTCARE_SKIP_DEP_CHECK=1` skips the check).

From then on `pnpm run dev`, `pnpm run build` and the PM2 start add settings introduced by an update to your
`.env` (with documentation and a default) and never overwrite values you set.

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
- [ ] `JWT_SECRET`, at least 32 random characters, never committed to version control
- [ ] `JWT_REFRESH_SECRET`, separate value from `JWT_SECRET`
- [ ] `DB_PATH`: points to persistent storage; back up the database file and the uploads folder before each release (some releases add data migrations)
- [ ] `ALLOWED_ORIGINS`, restricted to your actual frontend domain(s)
- [ ] `NAS_PATH`, points to persistent storage, not ephemeral container filesystem
- [ ] `PUBLIC_BASE_URL`: set to the public API origin when a proxy rewrites the Host header
- [ ] `OPENAI_API_KEY`, set if the `/more-info` endpoint is needed
- [ ] `RECOGNITION_MODEL_PATH`: path to the plant recognition ONNX model. The Docker image bakes the model in at `/app/models/dinov2-small-q8.onnx`; outside Docker run `pnpm run model:fetch` (saves to `backend/models/`) and point the variable at it. Set it to an empty value to disable recognition, also under Docker (the API still starts and logs a warning if the file cannot be loaded)
- [ ] Migrations: they are applied automatically at startup; check the log for `Applied migration` lines after an upgrade
- [ ] `TRUST_PROXY_HOPS` equals the real number of reverse proxies in front of the backend
- [ ] After upgrading from a release without persisted sessions: users sign in once more; run `pnpm run images:backfill` (or set `IMAGE_BACKFILL_ON_START=true` for one start)
- [ ] `/uploads` is served by nginx (or the proxy) from the same directory as `NAS_PATH`, with a long immutable cache
- [ ] Playwright Chromium installed, run `pnpm exec playwright install chromium` if using the sales scraper

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
→ { "status": "ok", "uptime": "0d 0h 20m 34s", "uptime_s": 1234, "db": "connected", "version": "v2",
    "event_loop_delay": { "p50_ms": 10.4, "p99_ms": 14.1, "max_ms": 31.7 }, "rss_mb": 212.5 }
→ 503 if DB is unreachable

GET /api/v2/health/ready
→ { "ready": true }
→ 503 { "ready": false } if the DB is unreachable or the recognition model is still loading
```

`/health` is a cheap liveness probe (one DB ping). `event_loop_delay` covers the last completed 60 second window, so alert on `p99_ms` or `max_ms` at any poll rate. `/health/ready` answers `200` only after the model has loaded (the load starts after the port opens, so a restart serves requests before it is ready; with recognition disabled it is ready at once).

**Kubernetes / Docker usage:**
- Use `/api/v2/health/ready` for **readiness probes**: no traffic before the DB is reachable and the model is loaded. The backend Docker image uses it as its `HEALTHCHECK` (20 s start period)
- Use `/api/v2/health` for **liveness probes**: restarts the container if the server is stuck

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
2. Stops the background refresher and maintenance jobs
3. Closes the Playwright Chromium browser instance
4. Closes the SQLite database (WAL checkpoint via `closeDb()`)
5. Exits with code `0`

If shutdown takes longer than 10 seconds, the process force-exits with code `1`.

PM2 sends `SIGTERM` before killing a process, so graceful shutdown works automatically with `pm2 reload` and `pm2 stop`.

## Static File Serving

Uploaded images are served from the `uploads/` directory (or `NAS_PATH` if set) via `@fastify/static`:

```typescript
await app.register(fastifyStatic, { root: uploadDir, prefix: '/uploads/', decorateReply: false });
```

For production, consider serving uploads through **nginx** instead:

```nginx
location /uploads/ {
    alias /mnt/nas/plantcare/uploads/;
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

Stored files are never rewritten under the same name, so the long immutable cache is safe. This offloads static file serving from Node.js and enables kernel-level sendfile optimization.

## Reverse Proxy (nginx)

Example nginx config:

```nginx
server {
    listen 443 ssl;
    server_name api.yourapp.com;

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Required for SSE (Server-Sent Events): only these two streams are unbuffered
    location ~ ^/api/v[0-9]+/(sales|more-info)/?$ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }

    location /uploads/ {
        alias /mnt/nas/plantcare/uploads/;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

The `proxy_buffering off` setting is critical for the two SSE streams: nginx buffers responses by default, which breaks the real-time stream. Keep the other API routes buffered so nginx can absorb slow clients, and set `TRUST_PROXY_HOPS` to the number of proxies in this chain.

## Logging

Logs are written to `./logs/` (relative to the working directory):

- `logs/error.log`: error-level entries only
- `logs/combined.log`: all levels

Both files rotate at 10 MB and keep 5 files. With `LOG_TO_STDOUT=true` no files are written and everything goes to stdout (in production at `info` level). Expected client errors (400, 404, 409) are logged at `info`, 401 at `debug`; only server faults reach `error`.

In development, logs are also printed to stdout with color and human-readable timestamps.

Every log line includes the `requestId` from `AsyncLocalStorage`, making it possible to trace a single request across multiple log entries:

```
14:23:01 | [info] [a1b2-c3d4] {PlantsController}: Plant created | {"plantId":7}
14:23:01 | [info] [a1b2-c3d4] {SQLitePlantRepository}: INSERT executed | {"affectedRows":1}
```

---

← [Testing](./testing.md) · **Next:** [Roadmap](./roadmap.md)
