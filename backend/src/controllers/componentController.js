const {
  selectComponents,
  selectComponent,
  insertComponent,
  updateComponentById,
  deleteComponentById,
} = require("../models/componentModel");

const { errorResponse, successResponse } = require("../utils/responseUtils");

const validateComponentName = (name) => {
  if (!name) {
    throw new Error("Component name is required.");
  };
};

const validateComponentData = (data) => {
  if (!data || typeof data !== "object" || !data.name || !data.fineness) {
    throw new Error("Invalid input: name and fineness are required.");
  }
};

// Fetch all components
const getComponents = async (req, res) => {
  try {
    const components = await selectComponents();
    successResponse(res, components);
  } catch (err) {
    errorResponse(res, err);
  }
};

// Fetch a single component by ID
const getComponent = async (req, res) => {
  const { id } = req.params;

  try {
    const component = await selectComponent(id);
    if (!component) {
      return res.status(404).json({ error: "Component not found" });
    }
    successResponse(res, component);
  } catch (err) {
    errorResponse(res, err);
  }
};

// Add a new component
const addComponent = async (req, res) => {
  const { name, fineness } = req.body;

  try {
    validateComponentData({ name, fineness });
    const result = await insertComponent(name, fineness);
    res.status(201).json({ id: result.insertId, name, fineness });
  } catch (err) {
    errorResponse(res, err, err.message.includes("required") ? 400 : 500);
  }
};

// Update an existing component by ID
const editComponent = async (req, res) => {
  const { id } = req.params;
  const { name, fineness } = req.body;

  try {
    validateComponentData({ name, fineness });
    const component = await selectComponent(id);
    if (!component) {
      return res.status(404).json({ error: "Component not found." });
    }

    await updateComponentById(id, name, fineness);
    successResponse(res, { message: "Component updated successfully." });
  } catch (err) {
    errorResponse(res, err);
  }
};

// Delete a component by ID
const deleteComponent = async (req, res) => {
  const { id } = req.params;

  try {
    const component = await selectComponent(id);
    if (!component) {
      return res.status(404).json({ error: "Component not found." });
    }

    await deleteComponentById(id);
    successResponse(res, { message: "Component deleted successfully." });
  } catch (err) {
    errorResponse(res, err);
  }
};

module.exports = {
  getComponents,
  getComponent,
  addComponent,
  editComponent,
  deleteComponent,
};
