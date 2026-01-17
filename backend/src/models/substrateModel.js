const pool = require("../config/db");
const { selectEntityImages } = require("../utils/imageUtils");

/**
 * =========================
 * Helpers
 * =========================
 */

const buildWhereClause = (conditions, params) => {
  const where = [];

  if (conditions.user_id !== undefined) {
    where.push("substrates.user_id = ?");
    params.push(Number(conditions.user_id));
  }

  if (conditions.id !== undefined) {
    where.push("substrates.id = ?");
    params.push(Number(conditions.id));
  }

  if (conditions.is_public !== undefined) {
    where.push("substrates.is_public = ?");
    params.push(Number(conditions.is_public));
  }

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
};

/**
 * =========================
 * Base SELECT
 * =========================
 */

const BASE_SELECT_QUERY = `
  SELECT 
    substrates.id AS substrate_id,
    substrates.name AS substrate_name,
    substrates.user_id AS substrate_user_id,
    substrates.is_public AS substrate_is_public,
    substrates.created_at AS substrate_created_at,

    substrate_components.component_id AS component_id,
    substrate_components.parts AS component_parts,

    components.name AS component_name,
    fineness_levels.name AS component_fineness_name

  FROM substrates
  LEFT JOIN substrate_components
    ON substrates.id = substrate_components.substrate_id
  LEFT JOIN components
    ON substrate_components.component_id = components.id
  LEFT JOIN fineness_levels
    ON components.fineness_id = fineness_levels.id
`;

/**
 * =========================
 * Select logic (side-effect free)
 * =========================
 */

const selectSubstrates = async (conditions = {}) => {
  const selectImages =
    conditions.selectImages !== undefined ? conditions.selectImages : true;

  const params = [];
  const whereSQL = buildWhereClause(conditions, params);
  const query = `${BASE_SELECT_QUERY} ${whereSQL}`;

  const [rows] = await pool.query(query, params);

  const substrateMap = new Map();

  for (const row of rows) {
    let substrate = substrateMap.get(row.substrate_id);

    if (!substrate) {
      substrate = {
        substrate_id: row.substrate_id,
        substrate_name: row.substrate_name,
        substrate_user_id: row.substrate_user_id,
        is_public: row.substrate_is_public,
        substrate_created_at: row.substrate_created_at,
        components: [],
      };

      substrateMap.set(row.substrate_id, substrate);
    }

    if (row.component_id != null) {
      substrate.components.push({
        component_id: row.component_id,
        component_name: row.component_name,
        component_fineness: row.component_fineness_name,
        component_parts: row.component_parts,
      });
    }
  }

  const substrates = Array.from(substrateMap.values());

  if (selectImages) {
    await Promise.all(
      substrates.map(async (substrate) => {
        const { latestImage, images } = await selectEntityImages(
          "substrate",
          substrate.substrate_id
        );
        substrate.image_url = latestImage;
        substrate.images = images;
      })
    );
  }

  return substrates;
};

/**
 * =========================
 * Public API (plantModel-style)
 * =========================
 */

const selectPublicSubstrates = () => selectSubstrates({ is_public: true });

const selectPrivateSubstrates = (user_id) => selectSubstrates({ user_id });

const selectSubstrate = (id, selectImages = true) =>
  selectSubstrates({ id, selectImages });

/**
 * =========================
 * Inserts
 * =========================
 */

const insertSubstrate = (name, user_id, is_public = false) =>
  pool.query(
    "INSERT INTO substrates (name, user_id, is_public) VALUES (?, ?, ?)",
    [name, user_id, is_public]
  );

const insertSubstrateComponent = (substrate_id, component_id, parts) =>
  pool.query(
    `
      INSERT INTO substrate_components (substrate_id, component_id, parts)
      VALUES (?, ?, ?)
    `,
    [substrate_id, component_id, parts]
  );

const updateSubstrate = (id, user_id, { name, is_public }) => {
  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push("name = ?");
    params.push(name);
  }

  if (is_public !== undefined) {
    updates.push("is_public = ?");
    params.push(is_public);
  }

  if (!updates.length) {
    return Promise.reject(new Error("No fields to update"));
  }

  params.push(id, user_id);

  return pool.query(
    `
      UPDATE substrates
      SET ${updates.join(", ")}
      WHERE id = ? AND user_id = ?
    `,
    params
  );
};

const upsertSubstrateComponent = (substrate_id, component_id, parts) =>
  pool.query(
    `
      INSERT INTO substrate_components (substrate_id, component_id, parts)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE parts = VALUES(parts)
    `,
    [substrate_id, component_id, parts]
  );

/**
 * =========================
 * Deletes
 * =========================
 */

const deleteSubstrateComponents = (substrate_id, componentIds) => {
  if (!componentIds.length) return Promise.resolve();

  const placeholders = componentIds.map(() => "?").join(", ");

  return pool.query(
    `
      DELETE FROM substrate_components
      WHERE substrate_id = ?
      AND component_id IN (${placeholders})
    `,
    [substrate_id, ...componentIds]
  );
};

const deleteSubstrate = (id, user_id) =>
  pool.query("DELETE FROM substrates WHERE id = ? AND user_id = ?", [
    id,
    user_id,
  ]);

/**
 * =========================
 * Exports
 * =========================
 */

module.exports = {
  selectPublicSubstrates,
  selectPrivateSubstrates,
  selectSubstrate,
  insertSubstrate,
  insertSubstrateComponent,
  updateSubstrate,
  upsertSubstrateComponent,
  deleteSubstrateComponents,
  deleteSubstrate,
};
