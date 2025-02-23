const {
  getWateringRecords,
  addWateringRecord,
  updateWateringRecord,
  deleteWateringRecord,
} = require("../models/wateringModel");

const { errorResponse, successResponse } = require("../utils/responseUtils");

// Controller to fetch watering records for a specific plant
const getWateringRecordsForPlant = async (req, res) => {
  const { plantId } = req.params;
  const { userId } = req.user; // Assuming userId is stored in the request object (e.g., from a JWT token)

  try {
    const records = await getWateringRecords(plantId, userId); // Pass userId to ensure the plant belongs to the user
    if (records.length === 0) {
      return res
        .status(404)
        .json({ message: "No watering records found for this plant" });
    }
    successResponse(res, records);
  } catch (err) {
    errorResponse(res, err, 500, "Error fetching watering records");
  }
};

// Controller to add a new watering record
const addNewWateringRecord = async (req, res) => {
  const { plantId } = req.params;
  const { date, usedFertilizer, fertilizerType } = req.body;
  const { userId } = req.user; // Assuming userId is stored in the request object

  try {
    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    // Add watering record only if the plant belongs to the user
    const result = await addWateringRecord(
      plantId,
      date,
      usedFertilizer,
      fertilizerType,
      userId
    );
    const recordId = result.insertId;

    successResponse(res, { recordId }, 201);
  } catch (err) {
    errorResponse(res, err, 500, "Error adding watering record");
  }
};

// Controller to update an existing watering record
const editWateringRecord = async (req, res) => {
  const { recordId } = req.params;
  const { date, usedFertilizer, fertilizerType } = req.body;
  const { userId } = req.user; // Assuming userId is stored in the request object

  try {
    if (!date && usedFertilizer === undefined && !fertilizerType) {
      return res
        .status(400)
        .json({ message: "At least one field must be provided for update" });
    }

    // Pass userId to ensure the watering record can only be updated if the plant belongs to the user
    const result = await updateWateringRecord(
      recordId,
      { date, usedFertilizer, fertilizerType },
      userId
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Watering record not found or not authorized to update",
      });
    }

    successResponse(res, { message: "Watering record updated successfully" });
  } catch (err) {
    errorResponse(res, err, 500, "Error updating watering record");
  }
};

// Controller to delete a watering record
const deleteWateringRecordById = async (req, res) => {
  const { recordId } = req.params;
  const { userId } = req.user; // Assuming userId is stored in the request object

  try {
    // Pass userId to ensure the watering record can only be deleted if the plant belongs to the user
    const result = await deleteWateringRecord(recordId, userId);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Watering record not found or not authorized to delete",
      });
    }

    successResponse(res, { message: "Watering record deleted successfully" });
  } catch (err) {
    errorResponse(res, err, 500, "Error deleting watering record");
  }
};

module.exports = {
  getWateringRecordsForPlant,
  addNewWateringRecord,
  editWateringRecord,
  deleteWateringRecordById,
};
