const pool = require('../config/db');

// Base query for selecting images
const selectImagesQuery = `
  SELECT 
    plant_images.id as image_id,
    plant_images.image_url,
    plant_images.upload_date,
    plants.id as plant_id,
    plants.name as plant_name
  FROM plant_images
  LEFT JOIN plants ON plant_images.plant_id = plants.id
`;

// Function to select images with dynamic conditions
const selectImages = (conditions = {}, params = []) => {
  let whereClauses = [];

  if (conditions.plant_id) {
    whereClauses.push('plant_images.plant_id = ?');
    params.push(conditions.plant_id);
  }

  const whereSQL = whereClauses.length ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const query = `${selectImagesQuery} ${whereSQL}`;
  
  return pool.query(query, params);
};

// Insert an image for a plant
const insertImage = (plantId, imageUrl, uploadDate) =>
  pool.query('INSERT INTO plant_images (plant_id, image_url, upload_date) VALUES (?, ?, ?)', [plantId, imageUrl, uploadDate]);

module.exports = { insertImage, selectImages };
