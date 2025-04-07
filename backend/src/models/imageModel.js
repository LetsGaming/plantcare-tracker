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

// Function to select images with dynamic conditions
const selectImages = (conditions = {}, params = []) => {
  let whereClauses = [];
  let joinClauses = [];

  // Loop through each entity type and check if the condition is passed
  Object.keys(entityRelations).forEach((entityType) => {
    const entityId = conditions[`${entityType}_id`];
    if (entityId) {
      const entityTable = entityRelations[entityType];
      joinClauses.push(`JOIN ${entityTable} ON images.id = ${entityTable}.image_id`);
      whereClauses.push(`${entityTable}.${entityType}_id = ?`);
      params.push(entityId);
    }
  });

  const whereSQL = whereClauses.length ? ` WHERE ${whereClauses.join(" AND ")}` : "";
  const joinSQL = joinClauses.length ? joinClauses.join(" ") : "";

  const query = `${selectImagesQuery} ${joinSQL} ${whereSQL}`;
  return pool.query(query, params);
};

// Generic function to insert an image and associate it with an entity
const insertImage = (entityType, entityId, imageUrl) => {
  const entityTable = entityRelations[entityType];
  if (!entityTable) {
    throw new Error('Invalid entity type');
  }

  return pool.query("INSERT INTO images (image_url) VALUES (?)", [imageUrl])
    .then(result => {
      const imageId = result.insertId;
      return pool.query(
        `INSERT INTO ${entityTable} (${entityType}_id, image_id) VALUES (?, ?)`,
        [entityId, imageId]
      );
    });
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

  if (updates.length === 0) {
    throw new Error("No fields provided for update.");
  }

  params.push(id);
  const query = `UPDATE images SET ${updates.join(", ")} WHERE id = ?`;
  return pool.query(query, params);
};

// Generic function to delete an image and its associations with any entity
const deleteImage = (imageId) => {
  // Delete associations with all entity types
  const deleteRelations = Object.values(entityRelations).map((table) =>
    pool.query(`DELETE FROM ${table} WHERE image_id = ?`, [imageId])
  );

  // After deleting the associations, delete the image itself
  return Promise.all(deleteRelations).then(() => 
    pool.query("DELETE FROM images WHERE id = ?", [imageId])
  );
};

module.exports = { selectImages, insertImage, updateImage, deleteImage };
