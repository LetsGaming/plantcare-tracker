const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authMiddleware');
const { 
  getSubstrates, 
  getSubstrate, 
  addSubstrate, 
  editSubstrate,
  addSubstrateComponents,
  editSubstrateComponents
} = require('../controllers/substrateController');

// Get all substrates (authenticated)
router.get('/', authenticateToken, getSubstrates);

// Get a specific substrate (authenticated)
router.get('/:id', authenticateToken, getSubstrate);

// Add a new substrate (authenticated)
router.post('/', authenticateToken, addSubstrate);

// Update a specific substrate (authenticated)
router.put('/:id', authenticateToken, editSubstrate);

// Add components to a substrate (authenticated)
router.post('/components/:id', authenticateToken, addSubstrateComponents);
router.patch('/components/:id', authenticateToken, editSubstrateComponents);

module.exports = router;
