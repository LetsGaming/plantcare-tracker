const { OpenAI } = require("openai");
const logger = require("../../utils/logger");
const NodeCache = require("node-cache");

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 12 * 60 * 60 }); // Cache for 12 hours
// Initialize the OpenAI client with your API key from environment variables
let openai;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const getPlantCareFromOpenAI = async (plantName) => {
  try {
    if (!openai) {
      logger.warn("OpenAI API key not found. Skipping OpenAI request.");
      return null;
    }

    const cachedData = cache.get(plantName);
    if (cachedData) return cachedData;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "Du bist ein hilfreicher Botaniker, der Informationen über Pflanzen bereitstellt.",
        },
        {
          role: "user",
          content: `Gib mir detaillierte und wissenschaftlich belegte Pflegehinweise für die Pflanze "${plantName}". Die Hinweise sollen für Anfänger leicht verständlich und für erfahrene Pflanzeneltern hilfreich sein. Beziehe dich auf spezifische Bedürfnisse der Pflanze in Bezug auf Licht, Wasser, Temperatur, Boden, Düngung und häufige Probleme.`,
        },
        {
            role: "user",
            content: "Die Tipps sollten folgende Aufteilungen haben: Titel, Untertitel (Kurzbeschreibung), Licht (Beschreibung und Angabe in Lux), Temperatur (Beschreibung und Angabe in Grad Celsius), Luftfeuchtigkeit (Beschreibung und Angabe in Prozent), Wasser (Beschreibung und Hinweise wann eine Wässerung angebracht ist (Liste)), Düngung (Beschreibung und Angabe in PPM und N-P-K), Boden (Beschreibung und Auflistung an sinnvollen Bestandteilen), Probleme (Beschreibung und Lösung, Auflistung). Formatiere die Tipps so, dass sie leicht lesbar sind."
        }
      ],
    });
    const careTips = response.choices[0].message.content.trim();
    cache.set(plantName, careTips);
    return careTips;
  } catch (error) {
    console.error("Fehler bei der OpenAI-Anfrage:", error.message);
    return null;
  }
};

module.exports = { getPlantCareFromOpenAI };
