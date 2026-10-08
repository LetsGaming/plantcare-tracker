# PlantCare Tracker

A full-stack plant-care app: keep a logbook of your plants with photos, see at a glance which plant is
thirstiest and log watering in one tap, mix substrates from components, follow plant sales from several
shops, and stream AI-written care guides. A read-only guest mode lets visitors browse public plants.

The repository is a two-package monorepo:

```
plantcare/
├── backend/     Fastify 5 + TypeScript + SQLite (Kysely) REST/SSE API
├── frontend/    Ionic + Vue 3 app (Vite, installable PWA)
├── scripts/     dev-up and dev-down: isolated local stack with mock data
├── docker-compose.yml   Production-style stack (nginx + backend + data volume)
├── docs/        Entry point to the backend and frontend documentation
├── PRODUCT.md   Who the app is for and its principles
├── DESIGN.md    The visual system
└── .github/workflows/ci.yml   CI for both packages
```

## Tech stack

| | Backend | Frontend |
|---|---|---|
| Runtime / framework | Node 22, Fastify 5, TypeScript | Vue 3 (Options API), Ionic 8, Vite |
| Data | SQLite via better-sqlite3, Kysely queries, versioned migrations | Pinia stores with an L2 persistence plugin (`@ionic/storage`) |
| Auth | JWT access token with session id, refresh-token cookie, guest accounts | Single-flight token refresh bridged into the transport layer |
| Images | `@fastify/multipart` (10 MB cap, JPEG or PNG) + Sharp, relative paths plus `PUBLIC_BASE_URL` | Gallery, upload and placeholder components |
| AI and streaming | OpenAI care guides and shop scrapers over SSE, one-time tickets | Draft-and-commit stream handling in the stores |
| Look and feel | n/a | Botanical design system with tokens, dark mode class, self-hosted fonts, labeled 44px controls, German and English |
| PWA | n/a | Service worker (precache, uploads cache, never API responses), offline banner |
| Tests | Vitest: 572 tests, about 88% lines (contract suite over real SQLite) | Vitest + @vue/test-utils (jsdom): 391 tests, about 66% lines |

## Quick start

Prerequisites: **Node >= 22** and **pnpm >= 10** (`corepack enable pnpm`, or `npm i -g pnpm`). Both packages
pin the exact pnpm version in `packageManager`, and their `pnpm-workspace.yaml` files carry the
`onlyBuiltDependencies` allowlists pnpm 10 needs for native build scripts (better-sqlite3, sharp, esbuild).

### Fastest: isolated stack with mock data

```bash
pnpm --dir backend install && pnpm --dir frontend install
node scripts/dev-up.mjs --id my-session      # starts backend and frontend, seeds data, prints a signed-in url
node scripts/dev-down.mjs --id my-session    # stops exactly that stack and deletes its data
```

Each `--id` gets its own database, uploads, logs and free ports, so several sessions can run side by side.
The backend runs with mocked shops, a mocked AI guide and seeded accounts (`admin`, `grower`, `collector`,
`newbie`, password `DevPass123!`; guest via the login screen). `CLAUDE.md` lists what each seeded item is
for and how to add mock data for a new feature.

### Backend on its own

```bash
cd backend
pnpm install
pnpm run dev                # http://localhost:5000/api/v2; creates .env with generated JWT secrets, runs migrations
# optional: add OPENAI_API_KEY to backend/.env for the AI care guides
```

To import an installation from a MySQL dump: `pnpm run db:import -- path/to/dump.sql`.

### Frontend on its own

```bash
cd frontend
pnpm install
pnpm run dev                # http://localhost:5173
```

Settings live in `frontend/.env` (`VITE_API_URL`, `VITE_APP_TITLE`, `VITE_CACHE_EXPIRE_HOURS`). Nothing needs to
be edited by hand to get started: the file is created from `.env.example` when you run `dev` or `build`, and
every setting has a default (the API on the same host at port 5000 in development, `/api/v2` on the same origin
in a production build).

## Settings that never conflict with updates

Machine specific settings are not tracked by git. Each package has a committed `.env.example` and a gitignored
`.env` that heals itself: `pnpm run dev`, `pnpm run build` and `pnpm start` (PM2) create the file when it is
missing and append settings that were added to the example in an update, with their documentation and default.
Values you set are never touched, a key you commented out stays off, and the backend's JWT secrets are generated
for you. After `git pull` nothing has to be merged by hand.

## Checks

```bash
# Backend
cd backend
pnpm run lint && pnpm run format:check && pnpm run typecheck
pnpm run test:coverage      # contract suite on real SQLite, unit and integration tests
pnpm run build

# Frontend
cd frontend
pnpm run lint && pnpm run format:check && pnpm exec vue-tsc --noEmit
pnpm run check-keys         # German and English locale parity
pnpm exec vitest run --coverage
pnpm run build              # vue-tsc, production bundle, service worker
```

CI (`.github/workflows/ci.yml`) runs both packages in parallel on every push and pull request: install with a
frozen lockfile, lint, format check, typecheck, tests and the production build. Both packages use an ESLint
flat config and Prettier; violations that need behavior changes are baselined in `eslint-suppressions.json`,
the baseline only shrinks (`pnpm exec eslint . --prune-suppressions`).

## API in one paragraph

Everything lives under `/api/v2`. Successful responses wrap their payload in `{ "data": ... }`; errors come as
`{ "error": { "type", "message", "statusCode", "fields?" } }`. Mutations return the full resource a later GET
would deliver (POST also sets `Location`), successful DELETEs answer `204`, and guest tokens are rejected with
`403` on every mutating route. Server-sent-event endpoints (sales stream, AI care guides) authenticate with
single-use tickets from `POST /api/v2/auth/ticket`, valid for 60 seconds. Cross-origin frontends may send
`GET`, `HEAD`, `POST`, `PUT`, `PATCH` and `DELETE`. The full contract is in
[`backend/docs/api-reference.md`](backend/docs/api-reference.md).

## Documentation

| Topic | Location |
|---|---|
| Product record and principles | [`PRODUCT.md`](PRODUCT.md) |
| Visual system | [`DESIGN.md`](DESIGN.md), [`frontend/docs/design-system.md`](frontend/docs/design-system.md) |
| API reference | [`backend/docs/api-reference.md`](backend/docs/api-reference.md) |
| Backend architecture, authentication, database and migrations | [`backend/docs/`](backend/docs/index.md) |
| Frontend architecture, stores, tests | [`frontend/docs/`](frontend/docs/index.md) |
| Local stack and mock data | [`CLAUDE.md`](CLAUDE.md), `scripts/dev/seed/` |
| All documentation (entry point) | [`docs/`](docs/README.md) |

## Production notes

- **Docker**: `cp .env.docker.example .env`, set the two JWT secrets, then `docker compose up -d --build` serves the
  app on port 8080 (nginx for the PWA, proxy for `/api` and `/uploads`, backend with a data volume). Details in
  [`backend/docs/deployment.md`](backend/docs/deployment.md). An existing PM2 installation moves over with
  `scripts/migrate-pm2-to-docker.sh` (installs Docker if needed, copies the database and images, verifies).

- The backend ships a PM2 config (`backend/ecosystem.config.js`, production by default); `pnpm run build` emits
  JavaScript and `pnpm start` runs it.
- Back up the database file and the uploads folder before deploying a release that adds a data migration
  (`0002` deletes orphan image rows and files).
- Set `ALLOWED_ORIGINS` when the frontend is served from another origin than the API, and `PUBLIC_BASE_URL`
  when a proxy rewrites the host used in image URLs.
- Never commit `backend/.env`; use `.env.example` as the template and rotate any secret that has ever been
  pushed.
- Uploaded images live on the backend filesystem and are served from `/uploads`; the service worker caches
  them but never caches authenticated API responses.
