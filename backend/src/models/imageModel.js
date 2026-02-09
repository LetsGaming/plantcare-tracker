const pool = require("../config/db");

const selectImagesQuery = `
  SELECT 
    images.id as image_id,
    images.image_url,
    images.upload_date
  FROM images
`;

const entityRelations = {
  plant: "plant_images",
  substrate: "substrate_images",
  component: "component_images",
};

const buildWhereClause = (conditions = {}, params = []) => {
  let whereClauses = [];

  if (conditions.id) {
    whereClauses.push("images.id = ?");
    params.push(Number(conditions.id));
  }

  if (conditions.entity_type) {
    const entityTable = entityRelations[conditions.entity_type];
    if (entityTable && conditions.entity_id) {
      whereClauses.push(`${entityTable}.${conditions.entity_type}_id = ?`);
      params.push(Number(conditions.entity_id));
    }
  }

  return whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
};

const selectImages = async (conditions = {}) => {
  const params = [];
  const joinClauses = [];
  const { entity_type } = conditions;

  if (entity_type) {
    const entityTable = entityRelations[entity_type];
    if (entityTable) {
      joinClauses.push(
        `JOIN ${entityTable} ON images.id = ${entityTable}.image_id`,
      );
    }
  }

  const joinSQL = joinClauses.join(" ");
  const whereSQL = buildWhereClause(conditions, params);
  const query = `${selectImagesQuery} ${joinSQL} ${whereSQL}`;

  return await pool.query(query, params);
};

const insertImage = async (entityType, entityId, imageUrl, uploadDate) => {
  const entityTable = entityRelations[entityType];
  if (!entityTable) throw new Error("Invalid entity type");

  const [rows] = await pool.query(
    "INSERT INTO images (image_url, upload_date) VALUES (?, ?)",
    [imageUrl, uploadDate],
  );

  const imageId = rows.insertId;
  const insertQuery = `INSERT INTO ${entityTable} (${entityType}_id, image_id) VALUES (?, ?)`;
  return await pool.query(insertQuery, [entityId, imageId]);
};

const updateImage = (id, fields) => {
  const updates = [];
  const params = [];

  if (fields.date) {
    updates.push("upload_date = ?");
    params.push(fields.date);
  }
  if (fields.filePath) {
    updates.push("image_url = ?");
    params.push(fields.filePath);
  }

  if (updates.length === 0) throw new Error("No fields provided.");

  params.push(id);
  const query = `UPDATE images SET ${updates.join(", ")} WHERE id = ?`;
  return pool.query(query, params);
};

const deleteImage = async (imageId) => {
  const deleteRelations = Object.values(entityRelations).map((table) =>
    pool.query(`DELETE FROM ${table} WHERE image_id = ?`, [imageId]),
  );
  await Promise.all(deleteRelations);
  return await pool.query("DELETE FROM images WHERE id = ?", [imageId]);
};

module.exports = {
  selectImages,
  insertImage,
  updateImage,
  deleteImage,
};
