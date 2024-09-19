const pool = require('../config/db');

const insertImage = (plantId, imageUrl, uploadDate) =>
  pool.query('INSERT INTO plant_images (plant_id, image_url, upload_date) VALUES (?, ?, ?)', [plantId, imageUrl, uploadDate]);

const selectImages = () => 
  pool.query('SELECT * FROM plant_images');

const selectImage = (plantId) => 
  pool.query('SELECT * FROM plant_images WHERE plant_id = ?', [plantId]);

module.exports = { insertImage, selectImages, selectImage };
