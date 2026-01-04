const express = require("express");
const { authenticateToken } = require("../middlewares/authMiddleware");
const { getSalesData } = require("../controllers/sales/salesController");

const router = express.Router();

router.get("/", authenticateToken, getSalesData);

module.exports = router;
