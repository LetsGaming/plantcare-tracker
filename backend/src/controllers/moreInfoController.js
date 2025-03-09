const { errorResponse, successResponse } = require("../utils/responseUtils");
const { getPlantCareFromOpenAI } = require("./moreInfo/openaiClient");
const { generateLinks } = require("./moreInfo/plantSources");

const getMoreInfo = async (req, res) => {
  const { plantName } = req.body;
  if (!plantName)
    return res.status(400).json({ message: "plantName is required." });

  let cleanedName = plantName
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s*\([^)]*\)/g, ""); // Clean input

  try {
    const links = await generateLinks(cleanedName);
    const careTips = await getPlantCareFromOpenAI(cleanedName);
    return successResponse(res, { links, ai: careTips });
  } catch (error) {
    console.error("Error generating links:", error);
    return errorResponse(res, { message: "Error generating links." });
  }
};

module.exports = { getMoreInfo };
//
