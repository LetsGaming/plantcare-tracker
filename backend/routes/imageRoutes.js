const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');
const { uploadImage } = require('../controllers/imageController');

router.post('/', authenticateToken, uploadImage);

module.exports = router;
