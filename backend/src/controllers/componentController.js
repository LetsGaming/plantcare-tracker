const {
  insertComponent,
  updateComponentById,
} = require("../models/componentModel");

const { errorResponse } = require("../utils/responseUtils");

const validateComponentData = (name, fineness) => {
  if (!name || !["Grob", "Mittel", "Fein"].includes(fineness)) {
    throw new Error("Invalid component data");
  }
};

const addComponent = async (req, res) => {
  const { name, fineness } = req.body;

  try {
    validateComponentData(name, fineness);
    const [result] = await insertComponent(name, fineness);
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    
    errorResponse(
      res,
      error,
      error.message === "Invalid component data" ? 400 : 500
    );
  }
};

const updateComponent = async (req, res) => {
  const { id } = req.params;
  const { name, fineness } = req.body;

  try {
    validateComponentData(name, fineness);
    const [result] = await updateComponentById(id, name, fineness);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Component not found" });
    }
    res.status(200).json({ message: "Component updated successfully" });
  } catch (error) {
    errorResponse(
      res,
      error,
      error.message === "Invalid component data" ? 400 : 500
    );
  }
};

module.exports = {
  addComponent,
  updateComponent,
};
