const express = require('express');
const router = express.Router();
const {authenticateToken} = require('../middlewares/authMiddleware');
const {
  getPrivatePlants,
  getSpecificPlant,
  getPublicPlants,
  addPlant,
  editPlant
} = require('../controllers/plantController');

// Get a specific private plant for the authenticated user
router.get('/plant/:id', authenticateToken, getSpecificPlant);

// Get all private plants for the authenticated user
router.get('/private', authenticateToken, getPrivatePlants);

// Get all public plants (authentication required)
router.get('/public', authenticateToken, getPublicPlants);

// Add a new plant (authentication required)
router.post('/', authenticateToken, addPlant);

// Partially update an existing plant (authentication required)
router.patch('/:id', authenticateToken, editPlant);

module.exports = router;
