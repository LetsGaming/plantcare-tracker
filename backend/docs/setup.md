# Setup & Configuration

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** (or npm / yarn)
- **MySQL** 8+
- **Playwright Chromium** — only required for the sales scraper (5 of 9 scrapers use it)

## Installation

```bash
# 1. Install all dependencies
pnpm install

# 2. Add V2-specific runtime packages (if starting from V1's package.json)
pnpm add zod openai

# 3. Add test dependencies
pnpm add -D vitest @vitest/coverage-v8 supertest @types/supertest

# 4. Install Playwright browsers (skip if you don't need the sales scraper)
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
mysql -u your_user -p your_database < database/database-v2.sql
```

This creates all tables, inserts seed data (roles, guest user, fertilizer types, fineness levels), and applies all 12 performance indexes.

### Existing V1 Installation

The schema is identical between V1 and V2. Only indexes need to be added:

```bash
mysql -u your_user -p your_database < database/migration_v2_indexes.sql
```

See [Database](./database.md) for full schema reference.

## Running the Server

### Development

Uses `tsx` for direct TypeScript execution with hot reload via `nodemon`:

```bash
pnpm run dev:v2
```

The server starts on `PORT` (default: 5000). V1 continues running on the same process if `server.js` is started separately.

### Production

```bash
# Build TypeScript → JavaScript
pnpm run build:v2
# Output: ./dist-v2/

# Start compiled server
pnpm run start:v2
```

### TypeScript Type Check (no build)

```bash
pnpm run typecheck
```

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev:v2` | `nodemon --exec tsx server-v2.ts` | Development server with hot reload |
| `build:v2` | `tsc -p tsconfig.v2.json` | Compile to `./dist-v2/` |
| `start:v2` | `node dist-v2/server-v2.js` | Run compiled server |
| `typecheck` | `tsc -p tsconfig.v2.json --noEmit` | Type check without output |
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Watch mode |
| `test:coverage` | `vitest run --coverage` | With coverage report |

## TypeScript Configuration

`tsconfig.v2.json` key settings:

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
  "include": ["src/**/*", "server-v2.ts"]
}
```

Path aliases `@core/` and `@modules/` are available throughout the source.

---

← [Architecture](./architecture.md) · **Next:** [Database](./database.md)
