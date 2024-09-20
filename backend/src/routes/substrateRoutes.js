const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middlewares/authMiddleware');
const { 
  getSubstrates, 
  getSubstrate, 
  addSubstrate, 
  addSubstrateComponents, 
  addComponent, 
  updateComponent 
} = require('../controllers/substrateController');

// Get all substrates (authenticated)
router.get('/', authenticateToken, getSubstrates);

// Get a specific substrate (authenticated)
router.get('/:id', authenticateToken, getSubstrate);

// Add a new substrate (authenticated)
router.post('/', authenticateToken, addSubstrate);

// Add components to a substrate (authenticated)
router.post('/components', authenticateToken, addSubstrateComponents);

// Admin routes for component management
router.post('/admin/components', authenticateToken, isAdmin, addComponent);
router.put('/admin/components/:id', authenticateToken, isAdmin, updateComponent);

module.exports = router;
