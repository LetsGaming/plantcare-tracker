const pool = require('../config/db');

const uploadImage = async (req, res) => {
  const { plantId, imageUrl, uploadDate } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO plant_images (plant_id, image_url, upload_date) VALUES (?, ?, ?)',
      [plantId, imageUrl, uploadDate]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { uploadImage };
