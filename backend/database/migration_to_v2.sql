START TRANSACTION;

-- =============================================================================
-- Convert tables to InnoDB + utf8mb4
-- =============================================================================

ALTER TABLE roles               ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE users               ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE fineness_levels     ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE components          ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE substrates          ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE substrate_components ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE plants              ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE images              ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE plant_images        ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE substrate_images    ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE component_images    ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE fertilizer_types    ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;
ALTER TABLE watering_records    ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4;

-- =============================================================================
-- V2 Performance Indexes
-- =============================================================================

-- plants
ALTER TABLE plants
  ADD INDEX idx_plants_user_id   (user_id),
  ADD INDEX idx_plants_is_public (is_public),
  ADD INDEX idx_plants_substrate (substrate_id);

-- substrates
ALTER TABLE substrates
  ADD INDEX idx_substrates_user_id   (user_id),
  ADD INDEX idx_substrates_is_public (is_public);

-- substrate_components
ALTER TABLE substrate_components
  ADD INDEX idx_sc_component_id (component_id);

-- join tables
ALTER TABLE plant_images
  ADD INDEX idx_pi_image_id (image_id);

ALTER TABLE substrate_images
  ADD INDEX idx_si_image_id (image_id);

ALTER TABLE component_images
  ADD INDEX idx_ci_image_id (image_id);

-- watering_records
ALTER TABLE watering_records
  ADD INDEX idx_wr_plant_id (plant_id),
  ADD INDEX idx_wr_date     (date);

-- users
ALTER TABLE users
  ADD INDEX idx_users_role_id (role_id);

COMMIT;