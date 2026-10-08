# PlantCare Tracker: Frontend

Ionic and Vue 3 app (Options API, Pinia, Vite) for the PlantCare backend. It runs in the browser as an
installable PWA on phones and desktops, in German and English, in light and dark.

## Features

- A list of your plants with a watering line on every card, thirstiest first, and a Public tab for shared plants.
- Plant detail with a watering status band: last watered, rhythm, and a "Jetzt gießen" button with Undo.
- Watering calendar with fertilizer markers, photo gallery, substrate, and a streamed AI care guide.
- Substrates mixed from components (with a composition chart), and a component catalogue managed by admins.
- Sales from several shops with prices, discounts and a price history; admin screens for scraper health.
- Reminders and categories in a side-menu calendar, profile editing, guest mode (read-only).
- Every list and detail has loading, empty, error and not-found states with a next step.

## Tech stack

- **Ionic 8 and Vue 3 (Options API)**, no `<script setup>` (a test enforces it).
- **Pinia**: one store per data domain, with an optimistic-update helper and an L2 persistence plugin.
- **TypeScript**, **Vite**, **vite-plugin-pwa** (service worker in production builds only).
- **Design system**: tokens in `src/theme`, Bricolage Grotesque and Figtree self-hosted, one outline icon
  family. See [docs/design-system.md](./docs/design-system.md) and the repository `DESIGN.md`.

## Setup

Prerequisites: Node >= 22 and pnpm >= 10.

```bash
cd frontend
pnpm install
pnpm run dev            # http://localhost:5173, expects the backend on :5000
```

Settings are `VITE_*` variables in `frontend/.env` (`VITE_API_URL`, `VITE_APP_TITLE`,
`VITE_CACHE_EXPIRE_HOURS`). `pnpm run dev` and `pnpm run build` create the file from `.env.example` and add new
settings after updates without touching your values; every setting has a default. The Docker image builds with
the relative `/api/v2`.

For a complete local stack with mock data (backend with mocked shops and AI guide, seeded accounts), run from
the repository root:

```bash
node scripts/dev-up.mjs --id my-session
node scripts/dev-down.mjs --id my-session
```

The printed url signs you in automatically (development builds accept `?devToken=`).

## Checks

```bash
pnpm run lint
pnpm run format:check
pnpm exec vue-tsc --noEmit
pnpm run check-keys              # German and English locale files stay in sync
pnpm exec vitest run --coverage
pnpm run build
```

## Documentation

See [docs/index.md](./docs/index.md): architecture, design system, stores, API reference and the test setup.

## Contributing

Keep the Options API and the token-only styling rules (no hex colors or inline styles in components), add
both locale strings for every new text, and keep icons in `src/theme/icons.ts`. Pull requests are welcome.
