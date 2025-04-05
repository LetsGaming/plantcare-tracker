const express = require("express");
const { getMoreInfo } = require("../controllers/moreInfoController");
const { authenticateToken } = require("../middlewares/authMiddleware");

const router = express.Router();

// Route to get more information about a plant
router.get("/", authenticateToken, getMoreInfo);

module.exports = router;
