const { OpenAI } = require("openai");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 43200, checkperiod: 3600 }); // Cache for 12 hours, check every hour

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Format the OpenAI response to HTML (handles bold text, titles, sections, lists, and italics).
 * @param {string} text - The raw text from OpenAI.
 * @param {boolean} [htmlFormatting=false] - Whether to return HTML-formatted response.
 * @returns {string} - Formatted HTML.
 */
const formatToHTML = (text, htmlFormatting) => {
  if (!htmlFormatting) return text;

  let formattedText = text.trim();

  // 1. Convert the plant name at the start (first line) to a top-level <h1>
  formattedText = formattedText.replace(/^(.*?)(\n|$)/, "<h1>$1</h1>");

  // 2. Convert bold text (e.g., **Wasser:**) to <strong> tags
  formattedText = formattedText.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
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

/**
 * Fetch plant care information using OpenAI API.
 * @param {string} plantName - Name of the plant.
 * @param {boolean} [htmlFormatting=false] - Whether to return HTML-formatted response.
 * @param {string} [model="gpt-3.5-turbo"] - OpenAI model to use.
 * @returns {Promise<string|null>} - Formatted plant care instructions or null on failure.
 */
const getPlantCareFromOpenAI = async (
  plantName,
  htmlFormatting = false,
  model = "gpt-3.5-turbo"
) => {
  if (!openai) {
    console.warn("OpenAI API key not set. Skipping request.");
    return null;
  }

  try {
    // Check cache before making an API request
    const cachedData = cache.get(plantName);
    if (cachedData) return cachedData;

    const prompt = `Gib mir detaillierte und wissenschaftlich belegte Pflegehinweise für die Pflanze "${plantName}". 
    Die Hinweise sollen für Anfänger leicht verständlich und für erfahrene Pflanzeneltern hilfreich sein. 
    Beziehe dich auf Licht, Wasser, Temperatur, Boden, Düngung und häufige Probleme.
    Format: 
    - Titel
    - Untertitel (Kurzbeschreibung)
    - Licht (Lux)
    - Temperatur (°C)
    - Luftfeuchtigkeit (%)
    - Wasser (Hinweise wann notwendig)
    - Düngung (PPM, N-P-K)
    - Boden (Bestandteile)
    - Probleme (Lösungen, Auflistung)`; // Prompt for OpenAI

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Du bist ein hilfreicher Botaniker." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7, // Balance between randomness and coherence
      max_tokens: 500, // Limit token usage to save costs
    });

    const careTips = response.choices?.[0]?.message?.content?.trim();
    if (careTips) {
      // Format the response based on user request
      const formattedResponse = formatToHTML(careTips, htmlFormatting);
      cache.set(plantName, formattedResponse);
      return formattedResponse;
    }
  } catch (error) {
    console.error("OpenAI request failed:", error.message);
  }

  return null;
};

module.exports = { getPlantCareFromOpenAI };
