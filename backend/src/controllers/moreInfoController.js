const { errorResponse, successResponse } = require("../utils/responseUtils");
const { getPlantCareFromOpenAI } = require("./moreInfo/openaiClient");
const { generateLinks } = require("./moreInfo/plantSources");

const getMoreInfo = async (req, res) => {
  const { plantName, htmlFormatting } = req.body;
  if (!plantName)
    return res.status(400).json({ message: "plantName is required." });

  let cleanedName = plantName
    .replace(/\s*\([^)]*\)/g, "") // Remove anything inside parentheses first
    .replace(/[^a-zA-Z0-9 ]/g, ""); // Then clean up any remaining unwanted characters

  try {
    const links = await generateLinks(cleanedName);
    const careTips = await getPlantCareFromOpenAI(cleanedName, htmlFormatting);
    return successResponse(res, { links, ai: careTips }, "More info generated successfully.");
  } catch (error) {
    console.error("Error generating links:", error);
    return errorResponse(res, { message: "Error generating links." });
  }
};

module.exports = { getMoreInfo };
//
