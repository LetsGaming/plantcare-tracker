# Performance harness

Measures the production build against an isolated dev-up backend.

## Prerequisites

- Playwright in the backend package: `pnpm --dir backend add -D playwright` (already resolvable if `backend/node_modules/playwright` exists). Microsoft Edge is used when present; otherwise run `pnpm --dir backend exec playwright install chromium`.
- A running dev session: `node scripts/dev-up.mjs --id <id>`; stop it with `node scripts/dev-down.mjs --id <id>`.

## Usage

```bash
node scripts/perf/build-dist.mjs --id <id>              # production build into frontend/dist-perf
node scripts/perf/serve-dist.mjs --id <id> [--port N]   # prints the served URL
```

The build sets `VITE_API_URL=/api/v2`, so the app talks to its own origin. The server proxies `/api` and `/uploads` to the backend port recorded in `data/agent-<id>/dev-session.json`. `dist-perf` is gitignored. Every script accepts `--help`.

## Library

- `lib/session.mjs`: `parseFlags`, `requireId`, `loadSession(id)` (session file plus `apiBase`).
- `lib/browser.mjs`: `openPage()` returns a fresh mobile context (390x844, DPR 3, touch, service workers blocked) with CPU 4x and Fast 4G throttling constants, and a buffered `longtask` observer exposed as `window.__longtasks`.
