# Database

The backend uses SQLite through `better-sqlite3` (WAL mode, foreign keys on) and Kysely for typed
queries. The file lives at `DB_PATH` (default `./data/plantcare.db`). Timestamps are integer Unix epoch
seconds. The schema is owned by versioned migrations in `src/core/database/migrations/`; the table
types Kysely checks queries against are in `src/core/database/schema.ts`.

```
roles ──── users ──┬── substrates ── substrate_components ── components ── fineness_levels
                   │
                   └── plants ──┬── watering_records ── fertilizer_types
                                └── species

images   (entity_type + entity_id points at a plant, substrate or component)
scrape_source_health
```

## Migrations

Migrations are TypeScript files registered in `migrations/index.ts` and applied in order at startup by
`initDatabase()`. Kysely records applied names in its `kysely_migration` table, so each runs once.

| Migration | What it does |
|-----------|--------------|
| `0001_baseline` | Creates every table and index and seeds the lookup rows. Every statement is idempotent, so a database that predates migrations simply records it |
| `0002_purge_orphan_images` | Deletes image rows (and their files) whose plant, substrate or component no longer exists |
| `0003_relative_image_paths` | Stores image urls as origin-free paths (`/uploads/plant/a.webp`) and normalises Windows separators |
| `0004_source_health_issues` | Adds `scrape_source_health.issues`, a JSON array of the field-level problems of the latest scrape |

Add a schema change as a new numbered file; never edit an applied migration. Keep `schema.ts` in step.
There are no `down` migrations: restore from a backup instead. Take a copy of the database and the uploads
folder before deploying a release that adds a data migration (0002 deletes rows and files).

## Tables

### `roles`
Lookup: `admin` (1), `user` (2), `guest` (3). Names are case-insensitive and unique.

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Autoincrement |
| `username` | TEXT | Unique, case-insensitive |
| `password` | TEXT | bcrypt hash |
| `role_id` | INTEGER FK → `roles.id` | Default 3 |
| `created_at` | INTEGER | Epoch seconds |

The baseline seeds a `guest` user (id 0 on a fresh database). The guest row is never edited or deleted
through the API. Databases imported from an older installation may hold the guest under another id; user id
`0` is a valid identity everywhere in the code.

### `species`
`id`, `name` (unique, case-insensitive). Plant species are normalised here; creating a plant reuses an existing
species when the name matches ignoring case or is within a small edit distance (`SpeciesResolver`).

### `fineness_levels`, `fertilizer_types`
Seeded lookups: `coarse`, `medium`, `fine` and `organic`, `synthetic`.

### `components`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | |
| `fineness_id` | INTEGER FK → `fineness_levels.id` | |

### `substrates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | |
| `user_id` | INTEGER FK → `users.id` | Owner |
| `is_public` | INTEGER | 0 or 1 |
| `created_at` | INTEGER | Epoch seconds |

### `substrate_components`
Composition of a substrate: `substrate_id`, `component_id` (composite PK, both `ON DELETE CASCADE`) and `parts`
(REAL, rounded to two decimals). Declared `WITHOUT ROWID`.

### `plants`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `name` | TEXT | |
| `species_id` | INTEGER FK → `species.id` | `ON DELETE SET NULL` |
| `substrate_id` | INTEGER FK → `substrates.id` | `ON DELETE SET NULL` |
| `user_id` | INTEGER FK → `users.id` | `ON DELETE CASCADE` |
| `is_public` | INTEGER | 0 or 1 |
| `created_at` | INTEGER | Epoch seconds |

### `images`

One table for every entity type.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `image_url` | TEXT | Origin-free path such as `/uploads/plant/a-1f3c.webp`; responses add the origin |
| `entity_type` | TEXT | `plant`, `substrate` or `component` |
| `entity_id` | INTEGER | Id of the owning entity; no foreign key |
| `upload_date` | INTEGER | EXIF capture time, else upload time |

Because there is no foreign key, deleting a plant, substrate or component calls the images module's
`EntityImageCleanup`, which removes the rows and files. Reads order images by `upload_date`, then `id`.

### `image_embeddings`

One row per embedded plant photo.

| Column | Type | Notes |
|--------|------|-------|
| `image_id` | INTEGER PK FK → `images.id` | `ON DELETE CASCADE` |
| `model` | TEXT | Embedder id; rows of another model are ignored and re-embedded |
| `vector` | BLOB | L2-normalised float32 vector |

Written when a plant photo is stored (upload, replacement or a kept recognition snapshot) and by a
backfill at startup that also removes rows whose image is gone.

### `watering_records`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `plant_id` | INTEGER FK → `plants.id` | `ON DELETE CASCADE` |
| `date` | INTEGER | Epoch seconds |
| `used_fertilizer` | INTEGER | 0 or 1 |
| `fertilizer_type_id` | INTEGER FK → `fertilizer_types.id` | Nullable |

### `scrape_source_health`
One row per scrape source (`source_key` PK) with `kind` (`sales` or `search`), `status`, the active strategy,
item count, failure counters and timestamps (ISO strings). `issues` is a JSON array of `{ code, affected, total }`
for the latest run only (default `'[]'`), unlike `last_error`, which survives a recovery. Written by `SourceHealthTracker`, read by the admin
endpoints.

## Indexes

| Index | Table | Columns |
|-------|-------|---------|
| `idx_plants_list` | `plants` | `is_public, user_id` |
| `idx_images_lookup` | `images` | `entity_type, entity_id` |
| `idx_watering_history` | `watering_records` | `plant_id, date DESC` |

## Reading related rows

Repositories fetch an entity with its related rows in one JOIN and collapse the rows in `groupRows()`
(a `Map` keyed by entity id), so listing 50 plants is one query, not 101:

```sql
SELECT p.id, p.name, species.name, s.id, s.name, img.id, img.image_url, img.upload_date
FROM plants p
LEFT JOIN species ON p.species_id = species.id
LEFT JOIN substrates s ON p.substrate_id = s.id
LEFT JOIN images img ON img.entity_type = 'plant' AND img.entity_id = p.id
```

## Transactions

Multi-statement writes use `db.transaction().execute(trx => ...)`: adding or replacing substrate components,
deleting all images of an entity, and creating or updating a plant together with its species. Inside a
transaction always use `trx`, never the root instance (the single connection would wait on itself).

## Importing a MySQL dump

`pnpm run db:import -- path/to/dump.sql` builds a fresh database through the migrations and copies the dump's
rows into it (dump rows replace the seeded roles, guest user and lookups). It refuses a database that already
holds users and needs the dev dependencies (`tsx`).

---

← [Setup](./setup.md) · **Next:** [Authentication](./authentication.md)
