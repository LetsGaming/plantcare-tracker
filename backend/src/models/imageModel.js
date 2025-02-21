const pool = require('../config/db');

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

  if (conditions.entity_type) {
    whereClauses.push("images.entity_type = ?");
    params.push(conditions.entity_type);
  }
  if (conditions.entity_id) {
    whereClauses.push("images.entity_id = ?");
    params.push(conditions.entity_id);
  }

  const whereSQL = whereClauses.length ? ` WHERE ${whereClauses.join(" AND ")}` : "";
  const query = `${selectImagesQuery} ${whereSQL}`;
  return pool.query(query, params);
};

// Insert an image for any entity
const insertImage = (entityType, entityId, imageUrl, uploadDate) =>
  pool.query(
    'INSERT INTO images (entity_type, entity_id, image_url, upload_date) VALUES (?, ?, ?, ?)',
    [entityType, entityId, imageUrl, uploadDate]
  );

module.exports = { selectImages, insertImage };
