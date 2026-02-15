const { validationErrorResponse, setupSSE } = require("../utils/responseUtils");
const { getPlantCareStream } = require("./moreInfo/openaiClient");
const { generateLinksStream } = require("./moreInfo/plantSources");

const getMoreInfo = async (req, res) => {
  // Extracting plantName, formatting, and language
  const { plantName, htmlFormatting, lang } = req.query;

  // Use query param 'lang', or fallback to Accept-Language header, or default to English
  const targetLanguage =
    lang || req.headers["accept-language"]?.split(",")[0] || "en";

  if (!plantName) {
    return validationErrorResponse(
      res,
      "plantName query parameter is required.",
    );
  }

  let cleanedName = plantName
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "");

  const sse = setupSSE(res);

  try {
    // 1. Scraper Stream
    const linksPromise = generateLinksStream(cleanedName, async (link) => {
      await sse.sendUnique([{ type: "link", value: link }], "value");
    });

    // 2. AI Stream (Now with language support)
    const aiPromise = getPlantCareStream(
      cleanedName,
      htmlFormatting === "true",
      async (chunk) => {
        await sse.sendUnique(
          [
            {
              type: "ai_chunk",
              value: chunk,
              author: { name: "LetsGamingDE", id: 272402865874534400n },
            },
          ],
          "value",
        );
      },
      targetLanguage,
    );

    await Promise.all([linksPromise, aiPromise]);

    await sse.end({ status: "completed" });
  } catch (error) {
    console.error("SSE Error:", error);
    if (!res.writableEnded) {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: "Information stream interrupted" })}\n\n`,
      );
      res.end();
    }
  }
};

module.exports = { getMoreInfo };
