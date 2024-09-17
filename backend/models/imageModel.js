const pool = require('../config/db');

const uploadImage = (plantId, imageUrl, uploadDate) =>
  pool.query('INSERT INTO plant_images (plant_id, image_url, upload_date) VALUES (?, ?, ?)', [plantId, imageUrl, uploadDate]);

export default { uploadImage };
