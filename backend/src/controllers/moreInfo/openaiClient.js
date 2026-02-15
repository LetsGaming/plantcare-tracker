const { OpenAI } = require("openai");
const NodeCache = require("node-cache");
const logger = require("../../utils/logger");

const cache = new NodeCache({ stdTTL: 43200, checkperiod: 3600 });

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Streams plant care information using OpenAI API with scientific focus.
 * @param {string} plantName - Name of the plant.
 * @param {boolean} htmlFormatting - Whether to format as HTML.
 * @param {function} onChunk - SSE callback.
 * @param {string} language - Target language for the response.
 */
const getPlantCareStream = async (
  plantName,
  htmlFormatting = false,
  onChunk,
  language = "en",
  model = "gpt-4o-mini"
) => {
  if (!openai) {
    logger.warn("OpenAI API key not set.");
    return null;
  }

  const cacheKey = `ai_${language}_${plantName.toLowerCase()}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    onChunk(cachedData);
    return cachedData;
  }

  try {
    const prompt = `Provide a high-detail botanical care guide for the plant: "${plantName}".
    
    ### SCIENTIFIC SPECIFICATIONS:
    - Identify the full Botanical Name (Genus + Species) and Family.
    - Light: Provide specific Lux ranges and light quality (e.g., PAR, filtered vs. direct).
    - Temperature/Humidity: Use metric units (°C) and relative humidity percentages.
    - Soil/Substrate: Suggest ideal pH ranges and specific components (e.g., coco coir, pumice).
    - Nutrition: Provide N-P-K ratios and PPM/EC (Electrical Conductivity) targets.

    ### FORMATTING:
    - Use Markdown: ## for sections, **bold** for key metrics.
    - Ensure a clear, structured list format for easy reading.
    - Language: You MUST write the entire response in the following language: ${language}.`;

    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { 
          role: "system", 
          content: `You are a professional horticulturist and botanical scientist. Your goal is to provide evidence-based, data-driven plant care instructions. You communicate exclusively in ${language}.` 
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3, // Low temperature for high factual accuracy
      max_tokens: 1000,
      stream: true,
    });

    let fullText = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullText += content;
        onChunk(content); 
      }
    }

    // Process final formatting for cache
    const formattedResponse = formatToHTML(fullText, htmlFormatting);
    cache.set(cacheKey, formattedResponse);
    return formattedResponse;
  } catch (error) {
    logger.error("OpenAI stream failed:", error.message);
    return null;
  }
};

// ... keep formatToHTML logic from your previous file ...

module.exports = { getPlantCareStream };