# Deployment

## Production Build

TypeScript is compiled to JavaScript before deployment. The output goes to `./dist-v2/`.

```bash
pnpm run build:v2
# → dist-v2/server-v2.js + type declarations + source maps

pnpm run start:v2
# → node dist-v2/server-v2.js
```

Set `NODE_ENV=production` before starting. This disables debug logging, removes stack traces from error responses, and enables production CORS enforcement.

## Environment Checklist

Go through this before every production deployment:

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` — at least 32 random characters, never committed to version control
- [ ] `JWT_REFRESH_SECRET` — separate value from `JWT_SECRET`
- [ ] `DB_PASSWORD` — stored in secrets manager or environment, not in `.env` files in the repo
- [ ] `ALLOWED_ORIGINS` — restricted to your actual frontend domain(s)
- [ ] `NAS_PATH` — points to persistent storage, not ephemeral container filesystem
- [ ] `OPENAI_API_KEY` — set if the `/more-info` endpoint is needed
- [ ] DB indexes applied — run `database/migration_v2_indexes.sql` if upgrading from V1
- [ ] Playwright Chromium installed — run `pnpm exec playwright install chromium` if using the sales scraper

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Process Management with PM2

PM2 keeps the process alive and restarts it on crash:

```bash
# Install globally
npm install -g pm2

# Start V2
pm2 start dist-v2/server-v2.js --name plantcare-v2

# Save process list (survives reboots)
pm2 save

# Register startup script
pm2 startup

# View logs
pm2 logs plantcare-v2

# Reload without downtime (re-reads env variables)
pm2 reload plantcare-v2
```

For a zero-downtime deployment with environment variables:

```bash
pm2 reload plantcare-v2 --update-env
```

## Health Checks

Two endpoints are available for monitoring and orchestration:

```
GET /health
→ { "status": "ok", "uptime": 1234.5, "db": "connected", "version": "v2" }
→ 503 if DB is unreachable

GET /health/ready
→ { "ready": true }
→ 503 if DB is unreachable
```

**Kubernetes / Docker usage:**
- Use `/health/ready` for **readiness probes** — prevents traffic before the DB is reachable
- Use `/health` for **liveness probes** — restarts the container if the server is stuck

**Example Kubernetes probe config:**

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 10

livenessProbe:
  httpGet:
    path: /health
    port: 5000
  initialDelaySeconds: 15
  periodSeconds: 30
```

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` (Ctrl+C) gracefully:

1. Stops accepting new HTTP connections
2. Closes the Playwright Chromium browser instance
3. Drains the MySQL connection pool
4. Exits with code `0`

If shutdown takes longer than 10 seconds, the process force-exits with code `1`.

PM2 sends `SIGTERM` before killing a process, so graceful shutdown works automatically with `pm2 reload` and `pm2 stop`.

## Static File Serving

Uploaded images are served from the `uploads/` directory (or `NAS_PATH` if set) via Express's built-in static middleware:

```typescript
app.use('/uploads', express.static(uploadDir));
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

Example nginx config for running V1 and V2 side by side:

```nginx
server {
    listen 443 ssl;
    server_name api.yourapp.com;

    location /api/v1 {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/v2 {
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
14:23:01 | [info] [a1b2-c3d4] {MySQLPlantRepository}: INSERT executed | {"affectedRows":1}
```

---

← [Testing](./testing.md) · **Next:** [Migration from V1](./migration.md)
