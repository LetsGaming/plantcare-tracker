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
      return notFoundResponse(res, "No fertilizer types available");
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
      fertilizerTypeId,
    );

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "Plant not found or not authorized to add watering record",
        404,
      );
    }

    const recordId = result.insertId;

    successResponse(
      res,
      { waterRecordId: recordId },
      "Watering record added successfully",
      201,
    );
  } catch (err) {
    const status = err.message === "Date is required." ? 400 : 500;
    errorResponse(res, err.message, status, err);
  }
};

// Controller to update an existing watering record
const editWateringRecord = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { date, usedFertilizer, fertilizerTypeId } = req.body;
    const userId = req.user?.id ?? null;

    if (!Number.isInteger(id)) {
      return errorResponse(
        res,
        "Watering record ID must be a valid number",
        400,
      );
    }

    if (
      date === undefined &&
      usedFertilizer === undefined &&
      fertilizerTypeId === undefined
    ) {
      return errorResponse(
        res,
        "At least one field must be provided for update",
        400,
      );
    }

    const parsedDate = date ? formatToDBDate(date) : null;

    const fertilizerTypeIdParsed =
      fertilizerTypeId === undefined || fertilizerTypeId === null
        ? fertilizerTypeId
        : Number(fertilizerTypeId);

    if (
      fertilizerTypeIdParsed !== undefined &&
      fertilizerTypeIdParsed !== null &&
      !Number.isInteger(fertilizerTypeIdParsed)
    ) {
      return errorResponse(
        res,
        "Fertilizer type ID must be a valid number",
        400,
      );
    }

    const result = await updateWateringRecord(id, userId, {
      date: parsedDate,
      usedFertilizer,
      fertilizerTypeId: fertilizerTypeIdParsed,
    });

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "Watering record not found or not authorized to update",
        404,
      );
    }

    return successResponse(
      res,
      { updated: true },
      "Watering record updated successfully",
    );
  } catch (err) {
    return errorResponse(
      res,
      err.message || "Error updating watering record",
      err.message ? 400 : 500,
      err,
    );
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
        "Watering record not found or not authorized to delete",
      );
    }

    successResponse(
      res,
      { deleted: true },
      "Watering record deleted successfully",
    );
  } catch (err) {
    errorResponse(res, "Error deleting watering record", 500, err);
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
