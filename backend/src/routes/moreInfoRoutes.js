const express = require("express");
const { getMoreInfo } = require("../controllers/moreInfoController");
const { authenticateSSE } = require("../middlewares/authMiddleware");

const router = express.Router();

// Route to get more information about a plant
router.get("/", authenticateSSE, getMoreInfo);

module.exports = router;
