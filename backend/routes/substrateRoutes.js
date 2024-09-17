const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');
const { getSubstrates, addSubstrate } = require('../controllers/substrateController');

router.get('/', authenticateToken, getSubstrates);
router.post('/', authenticateToken, addSubstrate);

module.exports = router;
