const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authMiddleware');
const {
  getPrivateSubstrates,
  getPublicSubstrates,
  getSpecificSubstrate,
  addSubstrate,
  editSubstrate,
  addSubstrateComponents,
  editSubstrateComponents,
  deleteSpecificSubstrate
} = require('../controllers/substrateController');

// Get a specific substrate for the authenticated user
router.get('/substrate/:id', authenticateToken, getSpecificSubstrate);

// Get all private substrates for the authenticated user
router.get('/private', authenticateToken, getPrivateSubstrates);

// Get all public substrates (authentication required)
router.get('/public', authenticateToken, getPublicSubstrates);

// Add a new substrate (authentication required)
router.post('/', authenticateToken, addSubstrate);

// Partially update an existing substrate (authentication required)
router.patch('/:id', authenticateToken, editSubstrate);

// Add components to a substrate (authentication required)
router.post('/components/:id', authenticateToken, addSubstrateComponents);

// Edit components of a substrate (authentication required)
router.patch('/components/:id', authenticateToken, editSubstrateComponents);

router.delete('/:id', authenticateToken, deleteSpecificSubstrate);

module.exports = router;
