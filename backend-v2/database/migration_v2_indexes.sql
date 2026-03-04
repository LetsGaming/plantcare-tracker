-- =============================================================================
-- Migration: V2 Performance Indexes
-- Description: Add missing indexes on FK columns and frequently filtered fields
-- Reversible: Yes (see rollback section at bottom)
-- =============================================================================

-- ── plants ────────────────────────────────────────────────────────────────────
-- V1 problem: SELECT WHERE user_id = ? and WHERE is_public = 1 do full scans
ALTER TABLE plants ADD INDEX idx_plants_user_id    (user_id);
ALTER TABLE plants ADD INDEX idx_plants_is_public  (is_public);
ALTER TABLE plants ADD INDEX idx_plants_substrate  (substrate_id);

-- ── substrates ────────────────────────────────────────────────────────────────
ALTER TABLE substrates ADD INDEX idx_substrates_user_id   (user_id);
ALTER TABLE substrates ADD INDEX idx_substrates_is_public (is_public);

-- ── substrate_components ──────────────────────────────────────────────────────
-- composite PK already covers (substrate_id, component_id)
-- add reverse index for lookups by component_id alone
ALTER TABLE substrate_components ADD INDEX idx_sc_component_id (component_id);

-- ── entity_images (polymorphic join table) ────────────────────────────────────
-- V1: every selectEntityImages() call does: WHERE entity_type = ? AND entity_id = ?
-- with no index → full table scan as images grow
ALTER TABLE entity_images ADD INDEX idx_ei_entity (entity_type, entity_id);

-- ── users ─────────────────────────────────────────────────────────────────────
-- username lookup on login is already unique (implicit index)
-- add role_id index for role-based queries
ALTER TABLE users ADD INDEX idx_users_role_id (role_id);

-- =============================================================================
-- ROLLBACK (run if you need to revert)
-- =============================================================================
-- ALTER TABLE plants            DROP INDEX idx_plants_user_id;
-- ALTER TABLE plants            DROP INDEX idx_plants_is_public;
-- ALTER TABLE plants            DROP INDEX idx_plants_substrate;
-- ALTER TABLE substrates        DROP INDEX idx_substrates_user_id;
-- ALTER TABLE substrates        DROP INDEX idx_substrates_is_public;
-- ALTER TABLE substrate_components DROP INDEX idx_sc_component_id;
-- ALTER TABLE entity_images     DROP INDEX idx_ei_entity;
-- ALTER TABLE users             DROP INDEX idx_users_role_id;
