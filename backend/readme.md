# PlantCare Tracker: Backend

REST and SSE API on Node.js 22, Fastify 5 and TypeScript, backed by SQLite.

```bash
pnpm install
pnpm run dev             # http://localhost:5000/api/v2
pnpm run test
```

The database file and its schema are created on first start. To import data from a MySQL dump of an
earlier installation: `pnpm run db:import -- path/to/dump.sql`.

Full documentation lives in [docs/index.md](./docs/index.md): setup, architecture, authentication,
the API reference, the database and migrations, testing and deployment.
