# PlantCare Tracker

A full-stack plant-care app: track your plants with photos, manage substrates
and their components, log watering and fertilizing on a calendar, and stream
AI-generated care guides — with a read-only guest mode for browsing public
plants.

The repository is a two-package monorepo:

```
plantcare/
├── backend/     Express 5 + TypeScript + SQLite REST/SSE API
├── frontend/    Ionic + Vue 3 app (Vite, Capacitor-ready)
└── .github/
    └── workflows/ci.yml   CI for both packages
```

## Tech stack

| | Backend | Frontend |
|---|---|---|
| Runtime / framework | Node 22, Express 5, TypeScript | Vue 3 (Options API), Ionic, Vite |
| Data | SQLite via better-sqlite3 | Two-tier cache: in-memory L1 + `@ionic/storage` L2 |
| Auth | JWT access token + refresh-token cookie, guest accounts | Token handling in `ApiUtils` with automatic refresh |
| Images | Multer (10 MB cap) + Sharp processing | Upload/gallery components per entity |
| AI / streaming | OpenAI care guides over SSE, one-time tickets | EventSource consumers for guides and sales |
| Tests | Vitest — 222 tests | Vitest + @vue/test-utils (jsdom) — 103 tests |

## Quick start

Prerequisites: **Node ≥ 22** and **pnpm ≥ 10** (`corepack enable pnpm`, or
`npm i -g pnpm`). Both packages pin the exact version via the
`packageManager` field, and their `pnpm-workspace.yaml` files carry the
`onlyBuiltDependencies` allowlists pnpm 10 needs to run native build
scripts (better-sqlite3, sharp, esbuild).

### Backend

```bash
cd backend
cp .env.example .env        # fill in JWT secrets + OpenAI key
pnpm install
node scripts/migrate-sqlite.js   # creates data/plantcare.db from the schema
pnpm run dev                     # http://localhost:5000/api/v2
```

### Frontend

```bash
cd frontend
pnpm install
pnpm run dev                     # http://localhost:5173
```

The frontend reads its API location from `frontend/src/config.json` — the
`development` block points at `http://localhost:5000/api/v2` out of the box;
set your domain in the `production` block before building.

## Testing & checks

```bash
# Backend
cd backend
pnpm run typecheck               # tsc --noEmit
pnpm test                        # 222 tests (JWT_SECRET/JWT_REFRESH_SECRET must be set)

# Frontend
cd frontend
pnpm exec vue-tsc --noEmit       # typecheck
pnpm exec vitest run             # 103 tests
pnpm run build                   # vue-tsc + production bundle
```

The backend test suite mocks the database module, so it runs without a
SQLite file or native build.

## Continuous integration

`.github/workflows/ci.yml` runs two parallel jobs on every push and pull
request:

- **Backend** — `pnpm install --frozen-lockfile`, typecheck, full test suite
  (with CI-only JWT values).
- **Frontend** — `pnpm install --frozen-lockfile` (Cypress binary skipped —
  no e2e in CI yet), full test suite, then `pnpm run build`, which covers
  both the `vue-tsc` typecheck and the production bundle.

There is no lint step yet: the ESLint config predates ESLint 10's flat-config
requirement and needs migration first (see the note in the workflow file).

## API in one paragraph

Everything lives under `/api/v2`. Successful responses wrap their payload in
`{ "data": ... }`; errors come as
`{ "error": { "type", "message", "statusCode", "fields?" } }`. Mutations
return the full resource a subsequent GET would deliver (POST also sets a
`Location` header), successful DELETEs answer `204`, and guest tokens are
rejected with `403` on every mutating route. Server-sent-event endpoints
(sales stream, AI care guides) authenticate with single-use tickets from
`POST /api/v2/auth/ticket`, valid for 60 seconds. The full contract is in
[`backend/docs/api-reference.md`](backend/docs/api-reference.md).

## Documentation

| Topic | Location |
|---|---|
| API reference (routes, payloads, errors) | [`backend/docs/api-reference.md`](backend/docs/api-reference.md) |
| Backend architecture (4-layer modules, SSE, config) | [`backend/docs/architecture.md`](backend/docs/architecture.md) |
| Authentication & guest rules | [`backend/docs/authentication.md`](backend/docs/authentication.md) |
| Setup, migration, deployment | [`backend/docs/`](backend/docs/) |
| Frontend architecture (caching, optimistic mutations, event-driven views) | [`frontend/docs/architecture.md`](frontend/docs/architecture.md) |
| Frontend service reference | [`frontend/docs/services.md`](frontend/docs/services.md) |
| Test suites (both packages) | [`backend/docs/testing.md`](backend/docs/testing.md), [`frontend/docs/testing.md`](frontend/docs/testing.md) |

## Production notes

- The backend ships a PM2 config (`backend/ecosystem.config.js`); `pnpm run
  build` emits JavaScript and `pnpm start` runs it.
- Never commit `backend/.env` — it is gitignored; use `.env.example` as the
  template and rotate any secret that has ever been pushed.
- Uploaded images are stored on the backend filesystem under the uploads
  directory and served from `/uploads`.