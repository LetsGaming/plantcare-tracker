const {
  selectComponents,
  selectComponent,
  insertComponent,
  deleteComponent,
  updateComponent,
} = require("../models/componentModel");

const {
  errorResponse,
  successResponse,
  notFoundResponse,
} = require("../utils/responseUtils");
const { deleteImagesByEntity } = require("./imageController");

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
      return notFoundResponse(res, "Component not found");
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
    componentId = result.insertId;

    successResponse(res, { id: componentId }, "Component added successfully", 201);
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
    successResponse(res, { updated: true }, "Component updated successfully");
  } catch (err) {
    errorResponse(res, err);
  }
};

// Delete a component by ID
const removeComponent = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await deleteComponent(id);
    if (result.affectedRows === 0) {
      return notFoundResponse(res, "Component not found");
    }

    await deleteImagesByEntity("component", id);
    successResponse(res, { deleted: true }, "Component deleted successfully");
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
