# Backend V2 — Setup

## 1. Neue Dependencies installieren

```bash
# Im backend-Ordner:
pnpm add zod
pnpm add -D typescript tsx @types/node @types/express @types/bcryptjs @types/jsonwebtoken @types/cookie-parser @types/cors @types/multer
```

## 2. Starten

**Entwicklung** (kein Build nötig, empfohlen):
```bash
pnpm run dev:v2
```

**Produktion:**
```bash
pnpm run build:v2
pnpm run start:v2
```

**Typecheck only:**
```bash
pnpm run typecheck
```

## 3. DB-Migration ausführen

```bash
mysql -u <user> -p <database> < database/migration_v2_indexes.sql
```

## Hinweis

V1 (`server.js` / `/api/v1/`) läuft parallel weiter.  
V2 läuft auf `/api/v2/` — aktuell implementiert: `/sales`, `/plants`, `/health`.
