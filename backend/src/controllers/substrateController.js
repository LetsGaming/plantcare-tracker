const {
  selectSubstrates,
  selectSubstrate,
  insertSubstrate,
  insertSubstrateComponent,
  updateSubstrate,
  updateSubstrateComponent,
} = require("../models/substrateModel");

const { errorResponse, successResponse } = require("../utils/responseUtils");

const validateName = (name) => {
  if (!name) {
    throw new Error("Name is required.");
  }
};

const validateSubstrateComponents = (substrateId, components) => {
  if (!substrateId || !Array.isArray(components) || components.length === 0) {
    throw new Error(
      "Invalid input: substrateId and components array are required."
    );
  }
};

const getSubstrates = async (req, res) => {
  try {
    const substrates = await selectSubstrates();
    successResponse(res, substrates);
  } catch (err) {
    errorResponse(res, err);
  }
};

const getSubstrate = async (req, res) => {
  const { id } = req.params;

  try {
    const [substrate] = await selectSubstrate(id);
    if (!substrate) {
      return res.status(404).json({ error: "Substrate not found" });
    }
    successResponse(res, substrate);
  } catch (err) {
    errorResponse(res, err);
  }
};

const addSubstrate = async (req, res) => {
  const { name } = req.body;

  try {
    validateName(name);
    const user = req.user;
    const [result] = await insertSubstrate(name, user.id);
    successResponse(res, { id: result.insertId });
  } catch (err) {
    errorResponse(res, err, err.message.includes("required") ? 400 : 500);
  }
};

const addSubstrateComponents = async (req, res) => {
  const { components } = req.body;
  const { id } = req.params;
  try {
    validateSubstrateComponents(id, components);
    const insertPromises = components.map(({ componentId, parts }) => {
      const decimalParts = parseFloat(parts).toFixed(2);
      return insertSubstrateComponent(id, componentId, decimalParts);
    });

    const [results] = await Promise.all(insertPromises);
    successResponse(res, results, 201)
  } catch (error) {
    errorResponse(res, error);
  }
};

const editSubstrate = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const user = req.user;

  try {
    validateName(name);

    await updateSubstrate(id, name, user.id);
    successResponse(res, { message: "Substrate updated successfully." });
  } catch (err) {
    errorResponse(res, err);
  }
};

const editSubstrateComponents = async (req, res) => {
  const { substrateId, components } = req.body;
  const user = req.user;

  try {
    validateSubstrateComponents(substrateId, components);
    const [substrate] = await selectSubstrate(substrateId);
    if (!substrate) {
      return res.status(404).json({ error: "Substrate not found." });
    }

    if (substrate.user_id !== user.id) {
      return errorResponse(res, "Forbidden: You are not authorized to update components of this substrate.", 403);
    }

    const updatePromises = components.map(({ componentId, parts }) => {
      const decimalParts = parseFloat(parts).toFixed(2);
      return updateSubstrateComponent(substrateId, componentId, decimalParts);
    });

    await Promise.all(updatePromises);
    successResponse(res, { message: "Substrate components updated successfully." });
  } catch (err) {
    errorResponse(res, err);
  }
};

module.exports = {
  getSubstrates,
  getSubstrate,
  addSubstrate,
  addSubstrateComponents,
  editSubstrate,
  editSubstrateComponents,
};
