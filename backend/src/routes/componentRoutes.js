// componentRoutes.js
const express = require("express");
const router = express.Router();
const { authenticateToken, isAdmin } = require("../middlewares/authMiddleware");
const {
  getComponents,
  getComponentById,
  addComponent,
  updateComponent,
  deleteComponent,
} = require("../controllers/componentController");

// Public route to fetch components
router.get("/", getComponents); // Get all components

// Public route to fetch a single component by ID
router.get("/:id", getComponentById); // Get a single component

// Admin routes for component management
router.post("/admin", authenticateToken, isAdmin, addComponent); // Add component
router.put("/admin/:id", authenticateToken, isAdmin, updateComponent); // Update component
router.delete("/admin/:id", authenticateToken, isAdmin, deleteComponent); // Delete component

module.exports = router;
