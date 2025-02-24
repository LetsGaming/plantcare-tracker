const {
  selectWateringRecord,
  selectWateringRecordsForPlant,
  insertWateringRecord,
  updateWateringRecord,
  deleteWateringRecord,
} = require("../models/wateringModel");

const {
  errorResponse,
  successResponse,
  notFoundResponse,
} = require("../utils/responseUtils");

// Centralized fetch logic for watering records
const getWateringRecord = async (res, selectFn, id, userId = null) => {
  try {
    const records = await selectFn(id, userId);
    if (records.length === 0) {
      return notFoundResponse(res, "Watering record not found");
    }
    successResponse(res, records);
  } catch (err) {
    errorResponse(res, err, 500, "Error fetching watering record(s)");
  }
};

// Controller to fetch watering records for a specific plant
const getWateringRecordsForPlant = async (req, res) => {
  const { plantId } = req.params;
  const userId = req.user ? req.user.id : null;

  await getWateringRecord(res, selectWateringRecordsForPlant, plantId, userId);
};

// Controller to fetch a specific watering record
const getSpecificWateringRecord = async (req, res) => {
  const { id } = req.params;
  const userId = req.user ? req.user.id : null;
  await getWateringRecord(res, selectWateringRecord, id, userId);
};

// Controller to add a new watering record
const addWateringRecord = async (req, res) => {
  const { plantId } = req.params;
  const { date = Date().now(), usedFertilizer, fertilizerType } = req.body;
  const userId = req.user ? req.user.id : null;

  try {
    const result = await insertWateringRecord(
      plantId,
      date,
      usedFertilizer,
      fertilizerType,
      userId
    );

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "Plant not found or not authorized to add watering record",
        404
      );
    }

    const recordId = result.insertId;

    successResponse(res, { waterRecordId: recordId }, 201);
  } catch (err) {
    const status = err.message === "Date is required." ? 400 : 500;
    errorResponse(res, err, status);
  }
};

// Controller to update an existing watering record
const editWateringRecord = async (req, res) => {
  const { id } = req.params;
  const { date, usedFertilizer, fertilizerType } = req.body;
  const userId = req.user ? req.user.id : null;

  try {
    if (!date && usedFertilizer === undefined && !fertilizerType) {
      return errorResponse(
        res,
        "At least one field must be provided for update",
        400
      );
    }

    const result = await updateWateringRecord(
      id,
      { date, usedFertilizer, fertilizerType },
      userId
    );

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "Watering record not found or not authorized to update"
      );
    }

    successResponse(res, { message: "Watering record updated successfully" });
  } catch (err) {
    errorResponse(res, err, 500, "Error updating watering record");
  }
};

// Controller to delete a watering record
const deleteSpecificWateringRecord = async (req, res) => {
  const { id } = req.params;
  const userId = req.user ? req.user.id : null;

  try {
    const result = await deleteWateringRecord(id, userId);

    if (result.affectedRows === 0) {
      return notFoundResponse(
        res,
        "Watering record not found or not authorized to delete"
      );
    }

    successResponse(res, { message: "Watering record deleted successfully" });
  } catch (err) {
    errorResponse(res, err, 500, "Error deleting watering record");
  }
};

module.exports = {
  getWateringRecordsForPlant,
  getSpecificWateringRecord,
  addWateringRecord,
  editWateringRecord,
  deleteSpecificWateringRecord,
};
