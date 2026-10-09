import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Embedder, EmbeddingRepository, RecognitionLogger } from '../domain/Recognition';

export class EmbedImagesService {
  constructor(
    private readonly embedder: Embedder,
    private readonly embeddings: EmbeddingRepository,
    private readonly uploadsDir: string,
    private readonly log: Pick<RecognitionLogger, 'warn' | 'info'>,
  ) {}

  async embedStored(imageId: number, imageUrl: string): Promise<boolean> {
    try {
      const buffer = await readFile(path.join(this.uploadsDir, 'plant', path.basename(imageUrl)));
      await this.embeddings.save(imageId, this.embedder.modelId, await this.embedder.embed(buffer));
      return true;
    } catch (err) {
      this.log.warn({ err, imageId }, 'plant image embedding failed');
      return false;
    }
  }

  async backfill(): Promise<number> {
    await this.embeddings.purgeOrphans();
    let embedded = 0;
    for (const { imageId, imageUrl } of await this.embeddings.plantImagesMissing(
      this.embedder.modelId,
    )) {
      if (await this.embedStored(imageId, imageUrl)) embedded++;
    }
    if (embedded > 0) this.log.info({ embedded }, 'plant image embeddings backfilled');
    return embedded;
  }
}
