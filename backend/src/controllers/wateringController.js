const {
  selectFertilizerTypes,
  selectWateringRecord,
  selectWateringRecordsForPlant,
  insertWateringRecord,
  updateWateringRecord,
  deleteWateringRecord,
} = require("../models/wateringModel");
const { formatToDBDate } = require("../utils/generalUtils");

const {
  errorResponse,
  successResponse,
  notFoundResponse,
} = require("../utils/responseUtils");

const getFertilizerTypes = async (req, res) => {
  try {
    const fertilizerTypes = await selectFertilizerTypes();
    if (fertilizerTypes.length === 0) {
      return notFoundResponse(res, "No fertilizer types found");
    }
    successResponse(res, fertilizerTypes);
  } catch (err) {
    errorResponse(res, "Error fetching fertilizer types", 500, err);
  }
};

// Centralized fetch logic for watering records
const getWateringRecord = async (res, selectFn, id, userId = null) => {
  try {
    const records = await selectFn(id, userId);
    if (records.length === 0) {
      return notFoundResponse(res, "Watering record not found");
    }
    successResponse(res, records);
  } catch (err) {
    errorResponse(res, "Error fetching watering record(s)", 500, err);
  }
};

// Controller to fetch watering records for a specific plant
const getWateringRecordsForPlant = async (req, res) => {
  const { plantId } = req.params;

  await getWateringRecord(res, selectWateringRecordsForPlant, plantId);
};

// Controller to fetch a specific watering record
const getSpecificWateringRecord = async (req, res) => {
  const { id } = req.params;
  await getWateringRecord(res, selectWateringRecord, id);
};

// Controller to add a new watering record
const addWateringRecord = async (req, res) => {
  const { plantId } = req.params;
  const {
    date = new Date().getTime(),
    usedFertilizer,
    fertilizerTypeId,
  } = req.body;
  const userId = req.user ? req.user.id : null;

  const parsedDate = formatToDBDate(date);
  try {
    const result = await insertWateringRecord(
      plantId,
      parsedDate,
      usedFertilizer,
      fertilizerTypeId
    );

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "Plant not found or not authorized to add watering record",
        404
      );
    }

    const recordId = result.insertId;

    successResponse(
      res,
      { waterRecordId: recordId },
      "Watering record added successfully",
      201
    );
  } catch (err) {
    const status = err.message === "Date is required." ? 400 : 500;
    errorResponse(res, err, status);
  }
};

// Controller to update an existing watering record
const editWateringRecord = async (req, res) => {
  const { id } = req.params;
  const { date, usedFertilizer, fertilizerTypeId } = req.body;
  const userId = req.user ? req.user.id : null;
  let parsedDate;
  try {
    parsedDate = date ? formatToDBDate(date) : null;
  } catch (err) {
    return errorResponse(res, err, 400);
  }
  try {
    if (!date && usedFertilizer === undefined && !fertilizerTypeId) {
      return errorResponse(
        res,
        "At least one field must be provided for update",
        400
      );
    }

    if (typeof fertilizerTypeId !== "number" && fertilizerTypeId !== null) {
      return errorResponse(res, "Fertilizer type ID must be a number", 400);
    }

    const result = await updateWateringRecord(id, userId, {
      date: parsedDate,
      usedFertilizer,
      fertilizerTypeId,
    });

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "Watering record not found or not authorized to update"
      );
    }

    successResponse(
      res,
      { updated: true },
      "Watering record updated successfully"
    );
  } catch (err) {
    console.error(err);
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

    successResponse(
      res,
      { deleted: true },
      "Watering record deleted successfully"
    );
  } catch (err) {
    errorResponse(res, err, 500, "Error deleting watering record");
  }
};

module.exports = {
  getFertilizerTypes,
  getWateringRecordsForPlant,
  getSpecificWateringRecord,
  addWateringRecord,
  editWateringRecord,
  deleteSpecificWateringRecord,
};
