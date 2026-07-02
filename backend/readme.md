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
pnpm run dev
```

**Produktion:**
```bash
pnpm run build
pnpm run start
```

**Typecheck only:**
```bash
pnpm run typecheck
```

## 3. DB-Migration ausführen

```bash
node scripts/migrate-sqlite.js
```

Die SQLite-Datenbank (inkl. Schema) wird beim ersten Start automatisch angelegt; das Skript wird nur für die Übernahme von Bestandsdaten benötigt.

## Hinweis

V2 ist der vollständige Ersatz für V1. V1 (`server.js`) wird nicht mehr benötigt.  
V2 läuft auf `/api/v2/` — implementiert: `/auth`, `/sales`, `/plants`, `/watering`, `/substrates`, `/components`, `/images`, `/more-info`.
