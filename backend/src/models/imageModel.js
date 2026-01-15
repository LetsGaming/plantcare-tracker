const pool = require("../config/db");

// Base query for selecting images
const selectImagesQuery = `
  SELECT 
    images.id as image_id,
    images.image_url,
    images.upload_date
  FROM images
`;

// Entity to relationship table mapping
const entityRelations = {
  plant: "plant_images",
  substrate: "substrate_images",
  component: "component_images",
};

const buildWhereClause = (conditions = {}, params = []) => {
  let whereClauses = [];

  if (conditions.id) {
    whereClauses.push("images.id = ?");
    params.push(conditions.id);
  }

  if (conditions.entity_type) {
    const entityTable = entityRelations[conditions.entity_type];
    if (entityTable) {
      whereClauses.push(`${entityTable}.${conditions.entity_type}_id = ?`);
      params.push(conditions.entity_id);
    }
  }

  return whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
};

// Function to select images with dynamic conditions
const selectImages = async (conditions = {}) => {
  const params = [];
  const joinClauses = [];

  const { entity_type } = conditions;

  if (entity_type) {
    const entityTable = entityRelations[entity_type];
    if (entityTable) {
      joinClauses.push(
        `JOIN ${entityTable} ON images.id = ${entityTable}.image_id`
      );
    }
  }

  const joinSQL = joinClauses.join(" ");
  const whereSQL = buildWhereClause(conditions, params);

  const query = `${selectImagesQuery} ${joinSQL} ${whereSQL}`;

  return await pool.query(query, params);
};

// Generic function to insert an image and associate it with an entity
const insertImage = async (entityType, entityId, imageUrl) => {
  const entityTable = entityRelations[entityType];
  if (!entityTable) {
    throw new Error("Invalid entity type");
  }

  const [rows] = await pool.query("INSERT INTO images (image_url) VALUES (?)", [
    imageUrl,
  ]);
  const imageId = rows.insertId;
  if (!imageId) {
    throw new Error("Image insertion failed");
  }
  const insertQuery = `INSERT INTO ${entityTable} (${entityType}_id, image_id) VALUES (?, ?)`;
  const insertParams = [entityId, imageId];
  return await pool.query(insertQuery, insertParams);
};

// Update image details (url and date)
const updateImage = (id, fields) => {
  const updates = [];
  const params = [];

  if (fields.image_url) {
    updates.push("image_url = ?");
    params.push(fields.image_url);
  }
  if (fields.date) {
    updates.push("upload_date = ?");
    params.push(fields.date);
  }
  if (fields.filePath) {
    updates.push("image_url = ?");
    params.push(fields.filePath);
  }

  if (updates.length === 0) {
    throw new Error("No fields provided for update.");
  }

  params.push(id);
  const query = `UPDATE images SET ${updates.join(", ")} WHERE id = ?`;
  return pool.query(query, params);
};

// Generic function to delete an image and its associations with any entity
const deleteImage = async (imageId) => {
  // Delete associations with all entity types
  const deleteRelations = Object.values(entityRelations).map((table) =>
    pool.query(`DELETE FROM ${table} WHERE image_id = ?`, [imageId])
  );

  // After deleting the associations, delete the image itself
  await Promise.all(deleteRelations);
  return await pool.query("DELETE FROM images WHERE id = ?", [imageId]);
};

module.exports = { selectImages, insertImage, updateImage, deleteImage };
