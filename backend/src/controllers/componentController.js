const {
  selectComponents,
  selectComponent,
  insertComponent,
  deleteComponent,
  updateComponent,
} = require("../models/componentModel");

const { errorResponse, successResponse } = require("../utils/responseUtils");

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
    const [result] = await insertComponent(name, fineness);
    componentId = result.id;

    successResponse(res, { componentId }, 201);
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

    await updateComponent(id, name, fineness);
    successResponse(res, { message: "Component updated successfully." });
  } catch (err) {
    errorResponse(res, err);
  }
};

// Delete a component by ID
const removeComponent = async (req, res) => {
  const { id } = req.params;

  try {
    await deleteComponent(id);
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
  removeComponent,
};
