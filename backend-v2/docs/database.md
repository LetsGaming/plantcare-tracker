# Database

## Schema Overview

All tables use `ENGINE=InnoDB` and `CHARSET=utf8mb4` (full Unicode including emoji).

```
roles ─────────────────── users
                            │  └── substrates ── substrate_components ── components
                            │           │                                     │
                            │      substrate_images                   component_images
                            │           └── images ──────────────────────────┘
                            │
                            └── plants ── watering_records ── fertilizer_types
                                   └── plant_images ── images
```

## Tables

### `roles`

Lookup table for user roles. Pre-seeded, not user-editable.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | Auto-increment |
| `name` | VARCHAR(50) UNIQUE | `admin`, `guest`, `user` |

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | Auto-increment |
| `username` | VARCHAR(100) UNIQUE | |
| `password` | CHAR(60) | bcrypt hash (always 60 chars) |
| `role_id` | INT FK → `roles.id` | Default: 3 (`user`) |
| `created_at` | TIMESTAMP | Auto |

**Seed data:** one guest user with username `guest` and password `guest`.

### `fineness_levels`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `name` | VARCHAR(50) UNIQUE | `coarse`, `medium`, `fine` |

### `components`

Substrate components (e.g. perlite, coco coir). Mutations are admin-only.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `name` | VARCHAR(100) | |
| `fineness_id` | INT FK → `fineness_levels.id` | |

### `substrates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `name` | VARCHAR(100) | |
| `user_id` | INT FK → `users.id` | Owner |
| `is_public` | BOOLEAN | Default: false |
| `created_at` | TIMESTAMP | Auto |

### `substrate_components`

Junction table defining the composition of a substrate.

| Column | Type | Notes |
|--------|------|-------|
| `substrate_id` | INT FK | Part of composite PK |
| `component_id` | INT FK | Part of composite PK |
| `parts` | DECIMAL(4,2) | Proportional amount (e.g. 2.50) |

Both FKs have `ON DELETE CASCADE`.

### `plants`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `name` | VARCHAR(100) | |
| `species` | VARCHAR(100) | |
| `substrate_id` | INT FK → `substrates.id` | `ON DELETE SET NULL` |
| `user_id` | INT FK → `users.id` | `ON DELETE CASCADE` |
| `is_public` | BOOLEAN | Default: false |
| `created_at` | TIMESTAMP | Auto |

### `images`

Central image store. Individual entities link to it through join tables.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `image_url` | VARCHAR(255) | Full URL served by the static file middleware |
| `upload_date` | TIMESTAMP | From EXIF metadata, or current time if unavailable |

### `plant_images` / `substrate_images` / `component_images`

Polymorphic image association implemented as separate join tables (one per entity type).

| Column | Type | Notes |
|--------|------|-------|
| `<entity>_id` | INT FK | `ON DELETE CASCADE` |
| `image_id` | INT FK | `ON DELETE CASCADE` |
| PK | Composite | `(<entity>_id, image_id)` |

Both FKs cascade — deleting a plant also deletes its join rows, and deleting an image also deletes its join rows. The application only needs to `DELETE FROM images WHERE id = ?`.

### `fertilizer_types`

Pre-seeded: `organic`, `synthetic`.

### `watering_records`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `plant_id` | INT FK → `plants.id` | `ON DELETE CASCADE` |
| `date` | DATETIME | Default: current timestamp |
| `used_fertilizer` | BOOLEAN | |
| `fertilizer_type_id` | INT FK → `fertilizer_types.id` | Nullable |

## Performance Indexes

12 indexes are added on top of the base schema. All are added by `database-v2.sql` (or `migration_v2_indexes.sql` for existing installations).

| Index | Table | Column(s) | Purpose |
|-------|-------|-----------|---------|
| `idx_plants_user_id` | `plants` | `user_id` | `WHERE user_id = ?` |
| `idx_plants_is_public` | `plants` | `is_public` | `WHERE is_public = 1` |
| `idx_plants_substrate` | `plants` | `substrate_id` | JOIN on substrate |
| `idx_substrates_user_id` | `substrates` | `user_id` | `WHERE user_id = ?` |
| `idx_substrates_is_public` | `substrates` | `is_public` | `WHERE is_public = 1` |
| `idx_sc_component_id` | `substrate_components` | `component_id` | Reverse lookup by component |
| `idx_pi_image_id` | `plant_images` | `image_id` | Fast CASCADE deletes |
| `idx_si_image_id` | `substrate_images` | `image_id` | Fast CASCADE deletes |
| `idx_ci_image_id` | `component_images` | `image_id` | Fast CASCADE deletes |
| `idx_wr_plant_id` | `watering_records` | `plant_id` | `WHERE plant_id = ?` |
| `idx_wr_date` | `watering_records` | `date` | Date range queries |
| `idx_users_role_id` | `users` | `role_id` | Role-based queries |

### Rollback Indexes

```sql
ALTER TABLE plants               DROP INDEX idx_plants_user_id;
ALTER TABLE plants               DROP INDEX idx_plants_is_public;
ALTER TABLE plants               DROP INDEX idx_plants_substrate;
ALTER TABLE substrates           DROP INDEX idx_substrates_user_id;
ALTER TABLE substrates           DROP INDEX idx_substrates_is_public;
ALTER TABLE substrate_components DROP INDEX idx_sc_component_id;
ALTER TABLE plant_images         DROP INDEX idx_pi_image_id;
ALTER TABLE substrate_images     DROP INDEX idx_si_image_id;
ALTER TABLE component_images     DROP INDEX idx_ci_image_id;
ALTER TABLE watering_records     DROP INDEX idx_wr_plant_id;
ALTER TABLE watering_records     DROP INDEX idx_wr_date;
ALTER TABLE users                DROP INDEX idx_users_role_id;
```

## N+1 Query Elimination

V1 used N+1 query patterns. V2 fetches all data in a single JOIN per operation:

### Example: Plants

**V1 (N+1):** `selectPlants()` → for each plant: `selectSubstrate()` + `selectEntityImages()`. 50 plants = 101 queries.

**V2 (1 query):**
```sql
SELECT
  p.id AS plant_id, p.name AS plant_name, ...,
  s.id AS substrate_id, s.name AS substrate_name,
  img.id AS image_id, img.image_url, img.upload_date
FROM plants p
LEFT JOIN substrates s   ON p.substrate_id = s.id
LEFT JOIN plant_images pi ON pi.plant_id = p.id
LEFT JOIN images img      ON img.id = pi.image_id
WHERE p.is_public = 1
```

Multiple images per plant result in multiple rows, which are collapsed in `groupRows()` using a `Map<plantId, { data, images[] }>`.

The same pattern is used for substrates (+ components) and components (+ images).

---

← [Setup](./setup.md) · **Next:** [Authentication](./authentication.md)
