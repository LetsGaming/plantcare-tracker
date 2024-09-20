const express = require("express");
const router = express.Router();
const { authenticateToken, isAdmin } = require("../middlewares/authMiddleware");
const {
  addComponent,
  updateComponent,
} = require("../controllers/substrateController");

// Admin routes for component management
router.post("/admin", authenticateToken, isAdmin, addComponent);
router.put(
  "/admin/:id",
  authenticateToken,
  isAdmin,
  updateComponent
);

module.exports = router;
