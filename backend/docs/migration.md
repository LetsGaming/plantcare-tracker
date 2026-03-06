# Migration from V1

V2 is a **complete replacement** for V1. V1 (`server.js`) has been removed. This document covers what changed and how to update client code accordingly.

## What Changes

The only breaking change for API clients is the base path:

```
/api/v1/  →  /api/v2/
```

All endpoint paths, request bodies, response shapes, cookies, and SSE mechanisms are **identical** between versions.

## Frontend Migration

Change the API base URL constant in your frontend from `/api/v1` to `/api/v2`. That's it.

```typescript
// Before
const API_BASE = '/api/v1';

// After
const API_BASE = '/api/v2';
```

No component changes, no type changes, no auth logic changes are needed.

## Database Migration

V2 uses the **same schema** as V1. The only addition is 12 performance indexes.

If upgrading from a V1 database:

```bash
mysql -u your_user -p your_database < database/migration_v2_indexes.sql
```

This is a non-destructive, backwards-compatible change.

### Verify Index Application

```sql
SHOW INDEX FROM plants;
SHOW INDEX FROM substrates;
SHOW INDEX FROM watering_records;
-- etc.
```

## Session Compatibility

V1 and V2 have **separate session stores**. A token issued by V1's login endpoint will not be recognized by V2's `authenticateToken` middleware.

Users will need to log in again after switching to V2. Present this as "you've been signed out due to an update."

## Known Breaking Changes from Draft V2

If you deployed an earlier draft of V2 that used the polymorphic `entity_images` table:

```sql
-- Old (draft) — remove if present
DROP TABLE IF EXISTS entity_images;
```

The final V2 uses separate join tables: `plant_images`, `substrate_images`, `component_images`. These are created by `database-v2.sql`.

## Rolling Back to V1

If V1 source is still available:

1. Restore the V1 `server.js` entry point
2. Switch the frontend back to `API_BASE = '/api/v1'`
3. No database rollback needed (indexes are additive and harmless)

To remove the V2 indexes if desired:

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

---

← [Deployment](./deployment.md) · **Next:** [Roadmap](./roadmap.md)
