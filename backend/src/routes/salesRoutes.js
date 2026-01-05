const express = require("express");
const { authenticateSSE } = require("../middlewares/authMiddleware");
const { getSalesData } = require("../controllers/sales/salesController");

const router = express.Router();

router.get("/", authenticateSSE, getSalesData);

module.exports = router;
