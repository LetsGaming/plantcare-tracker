# Plantcare Tracker — Backend

> REST API built with Node.js, Express, and TypeScript following Clean Architecture principles.
> V2 is a full replacement for V1.

---

## Quick Start

```bash
# Install
pnpm install

# Configure
cp .env.example .env        # fill in DB credentials and JWT secrets

# Database
mysql -u your_user -p your_db < database/database-v2.sql

# Develop
pnpm run dev             # hot reload via tsx

# Test
pnpm run test

# Build & run
pnpm run build && pnpm run start
```

---

## Documentation

### Getting Started
| | |
|--|--|
| [Overview](./overview.md) | What V2 is, improvements over V1, tech stack, project layout |
| [Setup](./setup.md) | Installation, all environment variables, npm scripts |

### Core Concepts
| | |
|--|--|
| [Architecture](./architecture.md) | Clean Architecture layers, dependency injection, core modules, Sales & MoreInfo internals |
| [Authentication](./authentication.md) | JWT flow, session store, guest access, SSE tickets, middleware reference |
| [Error Handling](./error-handling.md) | AppError hierarchy, global handler, adding new error types |

### Reference
| | |
|--|--|
| [API Reference](./api-reference.md) | All endpoints, request/response shapes, SSE event formats |
| [Database](./database.md) | Full schema, performance indexes, N+1 elimination |

### Operations
| | |
|--|--|
| [Testing](./testing.md) | Running tests, coverage, writing unit and integration tests |
| [Deployment](./deployment.md) | Production build, PM2, nginx, health checks, logging |
| [Migration from V1](./migration.md) | What changed, how to switch from V1 |
| [Roadmap](./roadmap.md) | Known limitations, planned improvements |

---

## Base URL & Response Format

```
/api/v2
```

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "error": { "type": "NotFoundError", "message": "Plant not found", "statusCode": 404 } }
```

## Module Overview

| Route prefix | Module | Description |
|---|---|---|
| `/api/v2/auth` | auth | Register, login, JWT refresh, profile management |
| `/api/v2/plants` | plants | Plant CRUD (public feed + private collection) |
| `/api/v2/watering` | watering | Watering records with fertilizer tracking |
| `/api/v2/substrates` | substrate | Substrate recipes with component composition |
| `/api/v2/components` | components | Substrate components — admin-managed |
| `/api/v2/images` | images | Upload, serve, delete via Sharp pipeline |
| `/api/v2/sales` | sales | Live SSE stream of plant sale prices (9 scrapers) |
| `/api/v2/more-info` | moreInfo | SSE stream: OpenAI care guide + 7 reference links |
| `/health` | — | Liveness and readiness probes |
