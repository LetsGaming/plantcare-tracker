const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authMiddleware');
const {
  getWateringRecordsForPlant,
  getSpecificWateringRecord,
  addWateringRecord,
  editWateringRecord,
  deleteWateringRecord,
} = require('../controllers/wateringController');

// Get all watering records for a specific plant (authentication required)
router.get('/plant/:plantId', authenticateToken, getWateringRecordsForPlant);

// Get a specific watering record by its ID (authentication required)
router.get('/:id', authenticateToken, getSpecificWateringRecord);

// Add a new watering record (authentication required)
router.post('/', authenticateToken, addWateringRecord);

// Partially update an existing watering record (authentication required)
router.patch('/:id', authenticateToken, editWateringRecord);

// Delete a specific watering record (authentication required)
router.delete('/:id', authenticateToken, deleteWateringRecord);

module.exports = router;
