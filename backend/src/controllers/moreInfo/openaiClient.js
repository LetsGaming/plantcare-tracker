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
  model = "gpt-4o-mini",
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
          content: `You are a professional horticulturist and botanical scientist. Your goal is to provide evidence-based, data-driven plant care instructions. You communicate exclusively in ${language}.`,
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

/**
 * Format the OpenAI response to HTML (handles bold text, titles, sections, lists, and italics).
 * @param {string} text - The raw text from OpenAI.
 * @param {boolean} [htmlFormatting=false] - Whether to return HTML-formatted response.
 * @returns {string} - Formatted HTML.
 */
const formatToHTML = (text, htmlFormatting) => {
  if (!htmlFormatting) return text;

  let formattedText = text.trim();

  //1. Convert headings (h6 to h1) based on the number of '#' characters
  formattedText = formattedText.replace(/^###### (.*)$/gm, "<h6>$1</h6>");
  formattedText = formattedText.replace(/^##### (.*)$/gm, "<h5>$1</h5>");
  formattedText = formattedText.replace(/^#### (.*)$/gm, "<h4>$1</h4>");
  formattedText = formattedText.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  formattedText = formattedText.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  formattedText = formattedText.replace(/^# (.*)$/gm, "<h1>$1</h1>");

  // 2. Convert bold text (e.g., **Wasser:**) to <strong> tags
  formattedText = formattedText.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>",
  );

  // 3. Convert italicized text (e.g., *text*) to <em> tags (for subtitles)
  formattedText = formattedText.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // 4. Convert section titles (e.g., **Temperatur:**) to <h2> tags
  formattedText = formattedText.replace(/^(.*?):$/gm, "<h2>$1</h2>");

  // 5. Convert bullet points (lines starting with '-' or '*') into <ul><li>...</li></ul>
  formattedText = formattedText
    .replace(/^[-\*]\s+/gm, "<ul><li>")
    .replace(/\n+/g, "</li>\n");

  // 6. Convert numbered lists (lines starting with numbers) into <ol><li>...</li></ol>
  formattedText = formattedText
    .replace(/^(\d+)\.\s+/gm, "<ol><li>")
    .replace(/\n+/g, "</li>\n");

  // 7. Close any unclosed <ul> or <ol> elements
  formattedText = formattedText.replace(/<\/li>\n<ul>/g, "</li></ul><ul>");
  formattedText = formattedText.replace(/<\/li>\n<ol>/g, "</li></ol><ol>");

  // 8. Remove excessive <ul> nesting by fixing the structure of the lists
  formattedText = formattedText.replace(/<\/ul>\n<ul>/g, "");

  // 9. Ensure paragraphs are properly wrapped in <p> tags
  formattedText = formattedText.replace(/\n+/g, "</p>\n<p>");
  formattedText = `<p>${formattedText}</p>`;

  return `<div>${formattedText}</div>`;
};

module.exports = { getPlantCareStream };
