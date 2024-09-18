const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');
const { getPlants, getPlant, addPlant } = require('../controllers/plantController');

router.get('/', authenticateToken, getPlants);
router.get('/:id', authenticateToken, getPlant);
router.post('/', authenticateToken, addPlant);

module.exports = router;
