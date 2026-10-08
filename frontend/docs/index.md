# Plantcare Tracker: Frontend Documentation

## Contents

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | Layers, store pattern, two-tier cache, session, SSE flow, error handling |
| [API Reference](./api-reference.md) | All V2 backend endpoints with request/response shapes |
| [Design system](./design-system.md) | Tokens, dark mode, shared UI components, screen states, navigation, PWA |
| [Stores](./stores.md) | Every Pinia store: state, getters, actions, cache keys |
| [Testing](./testing.md) | Test stack, running tests, writing new tests |

## Quick Start

```bash
# Install dependencies
pnpm install

# Isolated dev stack with mock data (from the repository root)
node scripts/dev-up.mjs --id my-session
node scripts/dev-down.mjs --id my-session

# Or just the dev server against a backend on :5000
pnpm dev

# Run unit tests
pnpm exec vitest run

# Type-check and build
pnpm build
```

## Compatibility

This frontend targets the `/api/v2` backend. Empty collections are `200 []`, errors use the
`{ error: { type, message, statusCode, fields? } }` envelope and every mutation returns the full resource.
