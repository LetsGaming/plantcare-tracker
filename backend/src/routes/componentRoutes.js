// componentRoutes.js
const express = require("express");
const router = express.Router();
const { authenticateToken, isAdmin } = require("../middlewares/authMiddleware");
const {
  getComponents,
  getComponent,
  addComponent,
  editComponent,
  removeComponent,
} = require("../controllers/componentController");

// Public route to fetch components
router.get("/", authenticateToken, getComponents); // Get all components

// Public route to fetch a single component by ID
router.get("/:id", authenticateToken, getComponent); // Get a single component

// Admin routes for component management
router.post("/admin", authenticateToken, isAdmin, addComponent); // Add component
router.put("/admin/:id", authenticateToken, isAdmin, editComponent); // Update component
router.delete("/admin/:id", authenticateToken, isAdmin, removeComponent); // Delete component

module.exports = router;
