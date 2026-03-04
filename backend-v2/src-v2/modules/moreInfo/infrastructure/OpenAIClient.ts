/**
 * modules/moreInfo/infrastructure/OpenAIClient.ts
 *
 * Streams plant care information from OpenAI.
 * Ported 1:1 from V1's openaiClient.js with TypeScript types added.
 * Cache uses the shared CacheService interface.
 */

import { OpenAI } from 'openai';
import type { CacheService } from '../../../core/cache/CacheService';
import { createModuleLogger } from '../../../core/logging';

const log = createModuleLogger('OpenAIClient');

const formatToHTML = (text: string, htmlFormatting: boolean): string => {
  if (!htmlFormatting) return text;
  let t = text.trim()
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^[-*]\s+(.*)$/gm, '<li>$1</li>');
  t = t.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');
  const lines = t.split('\n').map((line) => {
    if (!line.trim()) return '';
    if (/^<(h|ul|li)/i.test(line)) return line;
    return `<p>${line}</p>`;
  });
  return `<div>${lines.join('')}</div>`;
};

export class OpenAIPlantClient {
  private readonly client: OpenAI | null;

  constructor(private readonly cache: CacheService) {
    this.client = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
    if (!this.client) log.warn('OPENAI_API_KEY not set — AI responses disabled');
  }

  async streamPlantCare(
    plantName: string,
    htmlFormatting: boolean,
    onChunk: (chunk: string) => Promise<void>,
    language = 'en',
    model = 'gpt-4o-mini',
  ): Promise<void> {
    if (!this.client) return;

    const cacheKey = `ai_${language}_${plantName.toLowerCase()}`;
    const cached = this.cache.get<string>(cacheKey);
    if (cached) {
      await onChunk(formatToHTML(cached, htmlFormatting));
      return;
    }

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

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: `You are a professional horticulturist and botanical scientist. You communicate exclusively in ${language}.` },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
        stream: true,
      });

      let fullText = '';
      let buffer = '';
      const CHUNK_THRESHOLD = 60;

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content ?? '';
        if (!content) continue;

        fullText += content;
        buffer += content;

        const isNaturalBreak = /[\s\n]/.test(content);
        if ((buffer.length >= CHUNK_THRESHOLD && isNaturalBreak) || content.includes('\n')) {
          await onChunk(buffer);
          buffer = '';
        }
      }

      if (buffer.length > 0) await onChunk(buffer);

      // Cache raw markdown — formatting is applied per-request on cache read
      this.cache.set(cacheKey, fullText);
    } catch (err: unknown) {
      log.error(`OpenAI stream failed: ${(err as Error).message}`);
    }
  }
}
