const { OpenAI } = require("openai");
const NodeCache = require("node-cache");
const logger = require("../../utils/logger");

const cache = new NodeCache({ stdTTL: 43200, checkperiod: 3600 });

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Streams plant care information using OpenAI API.
 * Buffers chunks to provide a smoother UI experience.
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
    // Pass the raw string; the caller (service) will wrap it in the expected event type
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
          content: `You are a professional horticulturist and botanical scientist. You communicate exclusively in ${language}.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      stream: true,
    });

    let fullText = "";
    let buffer = "";
    // Increase threshold slightly for even "meatier" chunks
    const CHUNK_THRESHOLD = 60;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullText += content;
        buffer += content;

        /**
         * Logic: Send buffer if it's long enough AND we hit a natural break
         * (space or newline) to avoid cutting words in half.
         */
        const isNaturalBreak = /[\s\n]/.test(content);
        if (
          (buffer.length >= CHUNK_THRESHOLD && isNaturalBreak) ||
          content.includes("\n")
        ) {
          onChunk(buffer);
          buffer = "";
        }
      }
    }

    if (buffer.length > 0) {
      onChunk(buffer);
    }

    const formattedResponse = formatToHTML(fullText, htmlFormatting);
    cache.set(cacheKey, formattedResponse);
    return formattedResponse;
  } catch (error) {
    logger.error("OpenAI stream failed:", error.message);
    return null;
  }
};

/**
 * Fallback HTML Formatter for the cache.
 */
const formatToHTML = (text, htmlFormatting) => {
  if (!htmlFormatting) return text;

  let formattedText = text.trim();

  // Basic Markdown to HTML mapping
  formattedText = formattedText
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^[-\*]\s+(.*)$/gm, "<li>$1</li>");

  // Wrap lists
  formattedText = formattedText.replace(/(<li>.*?<\/li>)+/g, "<ul>$&</ul>");

  // Paragraphs
  const processed = formattedText.split("\n").map((line) => {
    if (!line.trim()) return "";
    if (/^<(h|ul|li)/i.test(line)) return line;
    return `<p>${line}</p>`;
  });

  return `<div>${processed.join("")}</div>`;
};

module.exports = { getPlantCareStream };
