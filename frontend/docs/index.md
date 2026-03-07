# Plantcare Tracker — Frontend V2 Documentation

## Contents

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | Layer overview, cache system, SSE flow, error handling |
| [API Reference](./api-reference.md) | All V2 backend endpoints with request/response shapes |
| [Services](./services.md) | Every service class: methods, cache keys, events |
| [Testing](./testing.md) | Test stack, running tests, writing new tests |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start dev server (connects to local backend on :5000)
pnpm dev

# Run unit tests
pnpm test

# Type-check
pnpm build
```

## Compatibility

This frontend targets **Backend V2 exclusively**. It is not compatible with the
V1 backend. The key differences from V1:

| Area | V1 | V2 |
|------|----|----|
| API version | `/api/v1` | `/api/v2` |
| Error envelope | `{ error: string, message: string }` | `{ error: { type, message, statusCode, fields? } }` |
| SSE ticket body | `{ ticket: "" }` | No body |
| MoreInfo SSE events | Array per event | Single object per event |
| Plant substrate | Full `SubstrateData` | Lightweight `SubstrateRef` |
| `is_public` field | `0 \| 1` (number) | `boolean` |
| Watering records | No `plant_name` | Includes `plant_name` and `owner_id` |
| Components | `component_description` field | No description; fineness name used |
| Collections (empty) | `404 Not Found` | `200 []` |
