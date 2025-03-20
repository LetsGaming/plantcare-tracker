const pool = require("../config/db");

// Base query for selecting images
const selectImagesQuery = `
  SELECT 
    images.id as image_id,
    images.entity_type,
    images.entity_id,
    images.image_url,
    images.upload_date
  FROM images
`;

// Function to select images with dynamic conditions
const selectImages = (conditions = {}, params = []) => {
  let whereClauses = [];

  if (conditions.id) {
    whereClauses.push("images.id = ?");
    params.push(conditions.id);
  }
  if (conditions.entity_type) {
    whereClauses.push("images.entity_type = ?");
    params.push(conditions.entity_type);
  }
  if (conditions.entity_id) {
    whereClauses.push("images.entity_id = ?");
    params.push(conditions.entity_id);
  }

  const whereSQL = whereClauses.length
    ? ` WHERE ${whereClauses.join(" AND ")}`
    : "";
  const query = `${selectImagesQuery} ${whereSQL}`;
  return pool.query(query, params);
};

// Insert an image for any entity
const insertImage = (entityType, entityId, imageUrl, uploadDate) => {
  return pool.query(
    "INSERT INTO images (entity_type, entity_id, image_url, upload_date) VALUES (?, ?, ?, ?)",
    [entityType, entityId, imageUrl, uploadDate]
  );
};

const updateImage = (id, fields) => {
  const updates = [];
  const params = [];

  // Dynamically build the update query based on provided fields
  if (fields.date) {
    updates.push("upload_date = ?");
    params.push(fields.date);
  }
  if (fields.filePath) {
    updates.push("image_url = ?");
    params.push(fields.filePath);
  }

  // If there are no fields to update, return early
  if (updates.length === 0) {
    throw new Error("No fields provided for update.");
  }
  // Add the ID to the parameters for the WHERE clause
  params.push(id);

  const query = `
      UPDATE images 
      SET ${updates.join(", ")}
      WHERE id = ?
    `;

  return pool.query(query, params);
};

const deleteImage = (imageId) => {
  return pool.query("DELETE FROM images WHERE id = ?", [imageId]);
};

module.exports = { selectImages, insertImage, updateImage, deleteImage };
