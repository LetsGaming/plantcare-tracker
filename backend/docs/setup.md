# Setup & Configuration

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** (or npm / yarn)
- **SQLite** — bundled via `better-sqlite3`, no separate server required
- **Playwright Chromium** — only required for the sales scraper (5 of 9 scrapers use it)

## Installation

```bash
# 1. Install all dependencies
pnpm install

# 2. Install Playwright browsers (skip if you don't need the sales scraper)
pnpm exec playwright install chromium
```

## Environment Variables

Create a `.env` file in the project root. All variables are optional unless marked **required**.

```env
# ── Database (required) ────────────────────────────────────────────────────────
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=plantcare

# ── JWT (required in production) ───────────────────────────────────────────────
# Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your-secure-secret-min-32-chars
JWT_REFRESH_SECRET=your-secure-refresh-secret
JWT_EXPIRATION=15m           # access token lifetime
JWT_REFRESH_EXPIRATION=7d   # refresh token lifetime

# ── Image storage ──────────────────────────────────────────────────────────────
# Defaults to ./uploads if not set
NAS_PATH=/mnt/nas/plantcare/uploads

# ── OpenAI ─────────────────────────────────────────────────────────────────────
# Optional — the /more-info endpoint returns nothing without this
OPENAI_API_KEY=sk-...

# ── Server ─────────────────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development          # or production

# ── CORS ───────────────────────────────────────────────────────────────────────
# Comma-separated list. In development, localhost:* is always allowed.
ALLOWED_ORIGINS=https://your-frontend.com
```

## Database Setup

### Fresh Installation

```bash
# Nothing to do — the SQLite file and schema are created automatically on first start.
# To import existing data: node scripts/migrate-sqlite.js
```

This creates all tables, inserts seed data (roles, guest user, fertilizer types, fineness levels), and applies all 12 performance indexes.

See [Database](./database.md) for full schema reference.

## Running the Server

### Development

Uses `tsx` for direct TypeScript execution with hot reload via `nodemon`:

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
| `dev` | `nodemon --exec tsx server.ts` | Development server with hot reload |
| `build` | `tsc -p tsconfig.json` | Compile to `./dist/` |
| `start` | `node scripts/start.js` | Build if needed, then run compiled server |
| `typecheck` | `tsc -p tsconfig.json --noEmit` | Type check without output |
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
