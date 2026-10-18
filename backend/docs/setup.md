# Setup & Configuration

## Prerequisites

- **Node.js** ≥ 22
- **pnpm** (or npm / yarn)
- **SQLite**, bundled via `better-sqlite3`, no separate server required
- **Playwright Chromium**, only required for the sales scraper (5 of 9 scrapers use it)

## Installation

```bash
# 1. Install all dependencies
pnpm install

# 2. Install Playwright browsers (skip if you don't need the sales scraper)
pnpm exec playwright install chromium
```

## Environment Variables

`pnpm run dev` and `pnpm start` create `backend/.env` from `.env.example` when it is missing (with generated JWT
secrets) and append settings that a later version added, without changing your values (`scripts/ensure-env.mjs`).
Edit the file to change anything. `core/config/env.ts` reads and validates the environment once at startup. Everything is optional except the two JWT secrets.

```env
# ── Database ───────────────────────────────────────────────────────────────────
# SQLite file; defaults to ./data/plantcare.db. Use :memory: for throwaway runs.
DB_PATH=./data/plantcare.db

# ── JWT (required: the server refuses to start without both secrets) ───────────
# Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your-secure-secret-min-32-chars
JWT_REFRESH_SECRET=your-secure-refresh-secret
JWT_EXPIRATION=15m           # access token lifetime
JWT_REFRESH_EXPIRATION=7d   # refresh token lifetime

# ── Image storage ──────────────────────────────────────────────────────────────
# Defaults to ./uploads if not set
NAS_PATH=/mnt/nas/plantcare/uploads

# Public origin used in image URLs. Set it when a proxy rewrites the Host header.
# Defaults to the origin of each request.
PUBLIC_BASE_URL=https://api.example.com

# ── OpenAI ─────────────────────────────────────────────────────────────────────
# Optional: without it /more-info ends its stream with an error event
OPENAI_API_KEY=sk-...

# ── Server ─────────────────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development          # or production

# ── CORS ───────────────────────────────────────────────────────────────────────
# Comma-separated list. In development, localhost:* is always allowed.
ALLOWED_ORIGINS=https://your-frontend.com

# ── Reverse proxy ──────────────────────────────────────────────────────────────
# Proxies in front of the server whose X-Forwarded-For is trusted (default 1, 0 = none).
# Must equal the real proxy count, otherwise clients can spoof their IP past the rate limiters.
TRUST_PROXY_HOPS=1

# ── Logging ────────────────────────────────────────────────────────────────────
# true = stdout only, no rotating files in ./logs (default false). Files rotate at 10 MB, 5 kept.
LOG_TO_STDOUT=false

# ── Sales refresher (background scraping) ──────────────────────────────────────
SALES_REFRESH_ENABLED=true        # false = no background scraping, only the admin recheck scrapes
SALES_REFRESH_INTERVAL_MIN=120    # minutes between refreshes of one source (1 to 10080)
SALES_REFRESH_WARM_DELAY_MS=5000  # delay after listen before stale sources refresh (0 to 600000)
SALES_RETENTION_DAYS=30           # days an inactive sale is kept (1 to 3650)
SALES_PRICE_POINTS_MAX=30         # price points kept per sale (1 to 1000)

# ── Images ─────────────────────────────────────────────────────────────────────
IMAGE_BACKFILL_ON_START=false     # create missing 160/480 px variants in the background after listen
UPLOAD_MAX_PIXELS=40000000        # decoder pixel limit for uploads (width x height)
```

## Database Setup

### Fresh Installation

```bash
# Nothing to do: the SQLite file and schema are created automatically on first start.
# To import existing data: pnpm run db:import -- path/to/dump.sql
```

The first start applies the migrations in `src/core/database/migrations/`: it creates all tables, inserts seed data (roles, guest user, fertilizer types, fineness levels) and creates the indexes.

See [Database](./database.md) for full schema reference.

## Running the Server

### Development

Uses `tsx` for direct TypeScript execution with hot reload via `tsx watch`:

```bash
pnpm run dev
```

The server starts on `PORT` (default: 5000).

### Production

```bash
# Build TypeScript → JavaScript
pnpm run build
# Output: ./dist/

# Start compiled server
pnpm run start
```

### TypeScript Type Check (no build)

```bash
pnpm run typecheck
```

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx watch server.ts` | Development server with hot reload |
| `src/tools/devServer.ts` | `tsx src/tools/devServer.ts` | The real app with mocked shop scrapers, AI guide, link searchers and a model-free image embedder (the real model when `RECOGNITION_MODEL_PATH` is set); started by `scripts/dev-up.mjs` with its own database, never reads `.env`, lifts the sign-in rate limits |
| `images:backfill` | `tsx src/tools/backfillImageVariants.ts` | Create the 160 and 480 px variants for images stored before variants existed (`-- --dry-run`, `-- --batch <1-1000>`), see [Deployment](./deployment.md#image-variants) |
| `db:vacuum` | `tsx src/tools/vacuumDb.ts` | Rebuild the database file to reclaim free pages; stop the server first |
| `db:import` | `tsx src/tools/importMysqlDumpCli.ts` | Import a MySQL dump into a fresh SQLite file |
| `build` | `tsc -p tsconfig.build.json` | Compile to `./dist/` |
| `start` | `node scripts/start.js` | Build if needed, then run compiled server |
| `typecheck` | `tsc -p tsconfig.json --noEmit` | Type check sources and tests without output |
| `lint` / `lint:fix` | `eslint .` | ESLint flat config (`eslint.config.mjs`) |
| `format` / `format:check` | `prettier --write .` / `--check .` | Prettier (`.prettierrc.json`) |
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Watch mode |
| `test:coverage` | `vitest run --coverage` | With coverage report |

## TypeScript Configuration

`tsconfig.json` key settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "paths": {
      "@core/*": ["src/core/*"],
      "@modules/*": ["src/modules/*"]
    }
  },
  "include": ["src/**/*", "server.ts"]
}
```

Path aliases `@core/` and `@modules/` are available throughout the source.

---

← [Architecture](./architecture.md) · **Next:** [Database](./database.md)
