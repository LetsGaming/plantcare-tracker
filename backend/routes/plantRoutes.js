const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');
const { getPlants, addPlant } = require('../controllers/plantController');

router.get('/', authenticateToken, getPlants);
router.post('/', authenticateToken, addPlant);

module.exports = router;
