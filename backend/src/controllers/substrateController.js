const {
  selectPrivateSubstrates,
  selectPublicSubstrates,
  selectSubstrate,
  insertSubstrate,
  insertSubstrateComponent,
  updateSubstrate,
  upsertSubstrateComponent,
  deleteSubstrateComponents,
  deleteSubstrate,
} = require("../models/substrateModel");

const { deleteImagesByEntityHandler } = require("../controllers/imageController");
const {
  errorResponse,
  successResponse,
  notFoundResponse,
} = require("../utils/responseUtils");
const { ensureArray, filterDuplicatesById } = require("../utils/generalUtils");

/**
 * Validate that required substrate fields are provided before insert
 */
const validateSubstrateData = (name) => {
  if (!name) {
    throw new Error("Name is required.");
  }
};

/**
 * Fetch multiple substrates using a model function and send HTTP response.
 * Works for both private and public lists.
 */
const getSubstrates = async (res, selectFn, userId = null) => {
  try {
    const substrates =
      userId !== null ? await selectFn(userId) : await selectFn();
    successResponse(res, substrates);
  } catch (err) {
    errorResponse(res, "Error fetching substrates", 500, err);
  }
};

const getAllSubstrates = async (req, res) => {
  try {
    const userId = req.user?.id ?? null;

    // Fetch public substrates
    const publicSubstrates = await selectPublicSubstrates();

    // Fetch private substrates only if user is logged in
    const privateSubstrates = userId
      ? await selectPrivateSubstrates(userId)
      : [];

    // Combine and filter duplicates
    const allSubstrates = filterDuplicatesById([
      ...publicSubstrates,
      ...privateSubstrates,
    ], "substrate_id");

    successResponse(res, allSubstrates);
  } catch (err) {
    errorResponse(res, "Error fetching substrates", 500, err);
  }
};

/**
 * Fetch all substrates belonging to the logged-in user
 */
const getPrivateSubstrates = async (req, res) => {
  await getSubstrates(res, selectPrivateSubstrates, req.user.id);
};

/**
 * Fetch all public substrates
 */
const getPublicSubstrates = async (req, res) => {
  await getSubstrates(res, selectPublicSubstrates);
};

/**
 * Fetch a single substrate by ID, returning 404 if not found
 */
const getSpecificSubstrate = async (req, res) => {
  const { id } = req.params;

  try {
    const [substrate] = await selectSubstrate(id);

    if (!substrate) {
      return notFoundResponse(res, "Substrate not found");
    }

    successResponse(res, substrate);
  } catch (err) {
    errorResponse(res, "Error fetching substrate", 500, err);
  }
};

/**
 * Insert a new substrate for the logged-in user
 */
const addSubstrate = async (req, res) => {
  const { name, isPublic } = req.body;
  const userId = req.user.id;

  try {
    validateSubstrateData(name);

    const [result] = await insertSubstrate(name, userId, Boolean(isPublic));

    successResponse(
      res,
      { substrateId: result.insertId },
      "Substrate added successfully",
      201
    );
  } catch (err) {
    errorResponse(
      res,
      err.message,
      err.message === "Name is required." ? 400 : 500,
      err
    );
  }
};

/**
 * Partially update substrate data and optionally remove components
 * Ensures that only the owner can update their substrate
 */
const editSubstrate = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { name, isPublic, removedComponents } = req.body;

  try {
    if (
      name === undefined &&
      isPublic === undefined &&
      (!removedComponents || removedComponents.length === 0)
    ) {
      return errorResponse(
        res,
        "At least one field must be provided for update",
        400
      );
    }

    const [substrate] = await selectSubstrate(id, false);

    if (!substrate) {
      return notFoundResponse(res, "Substrate not found");
    }

    if (substrate.substrate_user_id !== userId) {
      return errorResponse(res, "Unauthorized to update this substrate", 403);
    }

    // Update base substrate fields
    if (name !== undefined || isPublic !== undefined) {
      await updateSubstrate(id, userId, { name, is_public: isPublic });
    }

    // Delete selected components if requested
    if (removedComponents && removedComponents.length > 0) {
      await deleteSubstrateComponents(id, removedComponents);
    }

    successResponse(res, { updated: true }, "Substrate updated successfully");
  } catch (err) {
    errorResponse(res, "Error updating substrate", 500, err);
  }
};

/**
 * Add multiple components to a substrate
 * Ensures proper decimal formatting of component parts
 */
const addSubstrateComponents = async (req, res) => {
  const { id } = req.params;
  const components = ensureArray(req.body.components);

  if (!components.length) {
    return errorResponse(res, "Components array is required.", 400);
  }

  try {
    await Promise.all(
      components.map(({ componentId, parts }) =>
        insertSubstrateComponent(
          id,
          componentId,
          Number.parseFloat(parts).toFixed(2)
        )
      )
    );

    successResponse(
      res,
      { added: true },
      "Substrate components added successfully",
      201
    );
  } catch (err) {
    errorResponse(res, "Error adding substrate components", 500, err);
  }
};

/**
 * Update or insert components for a substrate
 * Uses upsert to either insert new components or update existing ones
 * Validates that the logged-in user owns the substrate
 */
const editSubstrateComponents = async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.user.id;
  const components = ensureArray(req.body.components);

  if (!Number.isInteger(id)) {
    return errorResponse(res, "Invalid substrate ID", 400);
  }

  if (!components.length) {
    return errorResponse(res, "Components array is required.", 400);
  }

  try {
    const [substrate] = await selectSubstrate(id, false);

    if (!substrate) {
      return notFoundResponse(res, "Substrate not found");
    }

    if (substrate.substrate_user_id !== userId) {
      return errorResponse(res, "Unauthorized to edit this substrate", 403);
    }

    await Promise.all(
      components.map(({ componentId, parts }) =>
        upsertSubstrateComponent(
          id,
          componentId,
          Number.parseFloat(parts).toFixed(2)
        )
      )
    );

    successResponse(
      res,
      { updated: true },
      "Substrate components updated successfully"
    );
  } catch (err) {
    errorResponse(res, "Error updating substrate components", 500, err);
  }
};

/**
 * Delete a substrate along with all associated images
 * Only the owner is allowed to delete
 */
const deleteSpecificSubstrate = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await deleteSubstrate(id, userId);

    if (result.affectedRows === 0) {
      return notFoundResponse(
        res,
        "Substrate not found or not authorized to delete"
      );
    }

    await deleteImagesByEntityHandler("substrate", id);

    successResponse(res, { deleted: true }, "Substrate deleted successfully");
  } catch (err) {
    errorResponse(res, "Error deleting substrate", 500, err);
  }
};

module.exports = {
  getAllSubstrates,
  getPrivateSubstrates,
  getPublicSubstrates,
  getSpecificSubstrate,
  addSubstrate,
  editSubstrate,
  addSubstrateComponents,
  editSubstrateComponents,
  deleteSpecificSubstrate,
};
