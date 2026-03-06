# Overview

The Plantcare Tracker Backend is a Node.js/Express REST API built with clean architecture principles. V2 is a **full replacement for V1** — V1 has been removed in favour of this rewrite.

## What's New in V2

| Area | V1 | V2 |
|------|----|----|
| Architecture | Flat MVC | Clean Architecture (Domain / Application / Infrastructure / Presentation) |
| Language | Plain JavaScript | TypeScript, strict mode |
| Validation | Manual `if` checks | Zod schemas at use-case boundaries |
| Error handling | `errorResponse()` helper per controller | Centralized `globalErrorHandler` with typed `AppError` hierarchy |
| N+1 queries | Present in plants, substrates, components | Eliminated — single JOIN queries throughout |
| SQL injection | Direct key interpolation in `UPDATE` | Column whitelist in `MySQLUserRepository` |
| Logging | `console.log` | Winston with AsyncLocalStorage request-ID correlation |
| Testing | None | Vitest unit + integration suite |

## V2 at a Glance

```
server.ts  →  /api/v2/auth
           →  /api/v2/plants
           →  /api/v2/watering
           →  /api/v2/substrates
           →  /api/v2/components
           →  /api/v2/images
           →  /api/v2/sales       (SSE)
           →  /api/v2/more-info   (SSE)
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 18 |
| Framework | Express 5 |
| Language | TypeScript 5 (strict) |
| Database | MySQL 8 via `mysql2/promise` |
| Validation | Zod |
| Auth | JWT (`jsonwebtoken`), bcrypt |
| Image processing | Sharp, exif-parser |
| Web scraping | Playwright (Chromium), Axios, node-html-parser |
| AI | OpenAI GPT-4o-mini |
| Logging | Winston |
| Caching | node-cache |
| Testing | Vitest, Supertest |

## Project Structure

```
backend/
├── server.ts                  # Entry point, composition root
├── tsconfig.json              # TypeScript config
├── vitest.config.ts           # Test runner config
│
├── src/
│   ├── core/                  # Shared infrastructure (no business logic)
│   │   ├── cache/             # CacheService interface + NodeCacheAdapter
│   │   ├── errors/            # AppError hierarchy (400–500)
│   │   ├── logging/           # Winston logger + AsyncLocalStorage
│   │   ├── middleware/        # auth, errorHandler, requestId
│   │   └── utils/             # formatToDBDate, ensureArray, filterDuplicatesById
│   │
│   ├── modules/
│   │   ├── auth/              # JWT auth, sessions, tickets
│   │   ├── plants/            # Plant CRUD
│   │   ├── watering/          # Watering records
│   │   ├── substrate/         # Substrate management
│   │   ├── components/        # Substrate components (admin-only mutations)
│   │   ├── images/            # Upload, serve, delete via Sharp pipeline
│   │   ├── sales/             # Live sale scraper + SSE stream
│   │   └── moreInfo/          # OpenAI plant care guide + link search (SSE)
│   │
│   └── types/
│       └── exif-parser.d.ts   # Type declaration for exif-parser
│
├── database/
│   ├── database-v2.sql        # Full schema + performance indexes
│   └── migration_v2_indexes.sql  # Indexes only (for existing V1 installations)
│
├── docs/                      # ← You are here
│
└── tests/
    ├── helpers/mockFactory.ts
    ├── unit/
    └── integration/
```

---

**Next:** [Architecture](./architecture.md) — how the layers fit together and why
