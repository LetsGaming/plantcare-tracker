const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middlewares/authMiddleware");
const { cleanRequestBody } = require("../middlewares/generalMiddleware");
const {
  getFertilizerTypes,
  getWateringRecordsForPlant,
  getSpecificWateringRecord,
  addWateringRecord,
  editWateringRecord,
  deleteSpecificWateringRecord,
} = require("../controllers/wateringController");

// Get all watering records for a specific plant (authentication required)
router.get("/plant/:plantId", authenticateToken, getWateringRecordsForPlant);

router.get("/fertilizer-types", authenticateToken, getFertilizerTypes);

// Get a specific watering record by its ID (authentication required)
router.get("/:id", authenticateToken, getSpecificWateringRecord);

// Add a new watering record (authentication required)
router.post("/:plantId", authenticateToken, addWateringRecord);

// Partially update an existing watering record (authentication required)
router.patch("/:id", authenticateToken, cleanRequestBody, editWateringRecord);

// Delete a specific watering record (authentication required)
router.delete("/:id", authenticateToken, deleteSpecificWateringRecord);


module.exports = router;
