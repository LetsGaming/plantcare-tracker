const { add } = require("winston");
const {
  selectPrivateSubstrates,
  selectPublicSubstrates,
  selectSubstrate,
  insertSubstrate,
  insertSubstrateComponent,
  updateSubstrate,
  updateSubstrateComponent,
  deleteSubstrateComponents,
  deleteSubstrate,
} = require("../models/substrateModel");

const {
  errorResponse,
  successResponse,
  notFoundResponse,
} = require("../utils/responseUtils");
const { deleteImagesByEntity } = require("./imageController");

// Centralized helper to fetch a single substrate
const getSubstrateById = async (res, selectSubstrateFn, id, userId = null) => {
  try {
    const substrates = await selectSubstrateFn(id, userId);
    const substrate = substrates[0];
    if (!substrate) {
      return notFoundResponse(res, "Substrate not found");
    }
    successResponse(res, substrate);
  } catch (err) {
    errorResponse(res, err, 500, "Error fetching substrate");
  }
};

// Centralized helper to fetch substrates list
const getSubstratesList = async (res, selectSubstratesFn, userId = null) => {
  try {
    const substrates = await selectSubstratesFn(userId);
    successResponse(res, substrates);
  } catch (err) {
    errorResponse(res, err);
  }
};

// Simple validation for substrate data
const validateSubstrateData = (name) => {
  if (!name) {
    throw new Error("Name is required.");
  }
};

// Controller for fetching private substrates
const getPrivateSubstrates = async (req, res) => {
  const userId = req.user.id;
  await getSubstratesList(res, selectPrivateSubstrates, userId);
};

// Controller for fetching public substrates
const getPublicSubstrates = async (req, res) => {
  await getSubstratesList(res, selectPublicSubstrates);
};

// Controller for fetching a single substrate by ID
const getSpecificSubstrate = async (req, res) => {
  const { id } = req.params;
  await getSubstrateById(res, selectSubstrate, id);
};

// Controller for adding a new substrate
const addSubstrate = async (req, res) => {
  const { name, isPublic } = req.body;
  const userId = req.user ? req.user.id : null;
  try {
    validateSubstrateData(name);
    const [result] = await insertSubstrate(name, userId, isPublic || false);
    successResponse(
      res,
      { substrateId: result.insertId },
      "Substrate added successfully",
      201
    );
  } catch (err) {
    const status = err.message.includes("required") ? 400 : 500;
    errorResponse(res, err, status);
  }
};

// Controller for updating a substrate
const editSubstrate = async (req, res) => {
  const { id } = req.params;
  const { name, isPublic, removedComponents } = req.body;
  const userId = req.user ? req.user.id : null;
  try {
    if (
      !name &&
      isPublic === undefined &&
      (!removedComponents || removedComponents.length === 0)
    ) {
      return errorResponse(
        res,
        "At least one field must be provided for update",
        400
      );
    }
    // Update primary substrate data if provided
    if (name || image_url || isPublic !== undefined) {
      const result = await updateSubstrate(id, userId, name, isPublic);
      if (result.affectedRows === 0) {
        return errorResponse(
          res,
          "Substrate not found or not authorized to update"
        );
      }
    }
    // Remove components if any are provided
    if (removedComponents && removedComponents.length > 0) {
      await deleteSubstrateComponents(id, removedComponents);
    }
    successResponse(res, { updated: true }, "Substrate updated successfully");
  } catch (err) {
    errorResponse(res, err, 500, "Error updating substrate");
  }
};

// Controller for adding substrate components
const addSubstrateComponents = async (req, res) => {
  const { components } = req.body;
  const { id } = req.params;
  try {
    if (!components || !Array.isArray(components) || components.length === 0) {
      throw new Error("Components array is required.");
    }
    // Add each component with properly formatted parts
    const insertPromises = components.map(({ componentId, parts }) => {
      const decimalParts = parseFloat(parts).toFixed(2);
      return insertSubstrateComponent(id, componentId, decimalParts);
    });
    await Promise.all(insertPromises);
    successResponse(
      res,
      { added: true },
      "Substrate components added successfully",
      201
    );
  } catch (err) {
    errorResponse(res, err);
  }
};

// Controller for editing substrate components
const editSubstrateComponents = async (req, res) => {
  const { id } = req.params;
  const { components } = req.body;
  const userId = req.user ? req.user.id : null;

  try {
    if (!Array.isArray(components) || components.length === 0) {
      return errorResponse(res, "Components array is required.", 400);
    }

    const compArray = components;

    const [substrate] = await selectSubstrate(id);
    if (substrate.user_id != userId) {
      return errorResponse(
        res,
        "Forbidden: You are not authorized to update components of this substrate.",
        403
      );
    }

    const updatePromises = compArray.map(({ componentId, parts }) => {
      const decimalParts = parseFloat(parts).toFixed(2);
      return updateSubstrateComponent(id, componentId, decimalParts);
    });

    await Promise.all(updatePromises);
    successResponse(res, { updated: true }, "Substrate components updated");
  } catch (err) {
    errorResponse(res, "Error updating substrate components", 500, err);
  }
};

const deleteSpecificSubstrate = async (req, res) => {
  const { id } = req.params;
  const userId = req.user ? req.user.id : null;

  try {
    const result = await deleteSubstrate(id, userId);

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "Substrate not found or not authorized to delete"
      );
    }

    await deleteImagesByEntity("substrate", id);

    successResponse(res, { deleted: true }, "Substrate deleted successfully");
  } catch (err) {
    errorResponse(res, err, 500, "Error deleting plant");
  }
};

module.exports = {
  getPrivateSubstrates,
  getPublicSubstrates,
  getSpecificSubstrate,
  addSubstrate,
  editSubstrate,
  addSubstrateComponents,
  editSubstrateComponents,
  deleteSpecificSubstrate,
};
