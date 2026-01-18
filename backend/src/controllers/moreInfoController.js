const {
  errorResponse,
  successResponse,
  validationErrorResponse,
} = require("../utils/responseUtils");
const { getPlantCareFromOpenAI } = require("./moreInfo/openaiClient");
const { generateLinks } = require("./moreInfo/plantSources");

const getMoreInfo = async (req, res) => {
  const { plantName, htmlFormatting } = req.query; // Extracting plantName and htmlFormatting from the query parameters
  if (!plantName)
    return validationErrorResponse(
      res,
      "plantName query parameter is required."
    );

  let cleanedName = plantName
    .replace(/\s*\([^)]*\)/g, "") // Remove anything inside parentheses first
    .replace(/[^a-zA-Z0-9 ]/g, ""); // Then clean up any remaining unwanted characters

  try {
    const links = await generateLinks(cleanedName);
    const careTips = await getPlantCareFromOpenAI(cleanedName, htmlFormatting);
    return successResponse(
      res,
      { links, ai: careTips },
      "More info generated successfully."
    );
  } catch (error) {
    return errorResponse(res, "Error generating more info", 500, error);
  }
};

module.exports = { getMoreInfo };
