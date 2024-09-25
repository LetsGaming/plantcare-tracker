const express = require('express');
const router = express.Router();
const {authenticateToken} = require('../middlewares/authMiddleware');
const {
  getPrivatePlants,
  getPrivatePlant,
  getPublicPlants,
  getPublicPlant,
  addPlant,
  editPlant
} = require('../controllers/plantController');

// Get all private plants for the authenticated user
router.get('/private', authenticateToken, getPrivatePlants);

// Get a specific private plant for the authenticated user
router.get('/private/:id', authenticateToken, getPrivatePlant);

// Get all public plants (authentication required)
router.get('/public', authenticateToken, getPublicPlants);

// Get a specific public plant (authentication required)
router.get('/public/:id', authenticateToken, getPublicPlant);

// Add a new plant (authentication required)
router.post('/', authenticateToken, addPlant);

// Partially update an existing plant (authentication required)
router.patch('/:id', authenticateToken, editPlant);

module.exports = router;
