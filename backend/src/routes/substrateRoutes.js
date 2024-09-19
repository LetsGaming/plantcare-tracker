const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');
const { getSubstrates, getSubstrate, addSubstrate } = require('../controllers/substrateController');

router.get('/', authenticateToken, getSubstrates);
router.get('/:id', authenticateToken, getSubstrate);
router.post('/', authenticateToken, addSubstrate);

module.exports = router;
