import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  EmbedQueueStats,
  Embedder,
  EmbeddingRepository,
  RecognitionLogger,
} from '../domain/Recognition';

export const BACKFILL_BATCH = 50;
const MAX_QUEUE = 100;
const RESCAN_DELAY_MS = 5_000;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

interface QueuedImage {
  imageId: number;
  imageUrl: string;
}

export class EmbedImagesService {
  private readonly queue: QueuedImage[] = [];
  private draining: Promise<void> | null = null;
  private running: Promise<number> | null = null;
  private rescanTimer?: NodeJS.Timeout;
  private pending = 0;
  private deferred = 0;
  private stopped = false;

  constructor(
    private readonly embedder: Embedder,
    private readonly embeddings: EmbeddingRepository,
    private readonly uploadsDir: string,
    private readonly log: Pick<RecognitionLogger, 'warn' | 'info'>,
    private readonly rescanDelayMs = RESCAN_DELAY_MS,
  ) {}

  stats(): EmbedQueueStats {
    return { queued: this.queue.length, pending: this.pending, deferred: this.deferred };
  }

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

  /** A full queue defers the image to the backfill, which finds it again through the missing set. */
  enqueue(imageId: number, imageUrl: string): void {
    if (this.stopped) return;
    if (this.queue.length >= MAX_QUEUE) {
      this.deferred++;
      this.log.warn({ imageId }, 'embedding queue full, image left to the backfill');
    } else {
      this.queue.push({ imageId, imageUrl });
      this.draining ??= this.drain().finally(() => {
        this.draining = null;
      });
    }
    this.scheduleRescan();
  }

  scheduleRescan(): void {
    if (this.stopped) return;
    clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      this.backfill().catch((err) => this.log.warn({ err }, 'embedding backfill failed'));
    }, this.rescanDelayMs);
    this.rescanTimer.unref();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.rescanTimer);
    this.queue.length = 0;
  }

  backfill(): Promise<number> {
    this.running ??= this.runBackfill().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    for (let next = this.queue.shift(); next; next = this.queue.shift()) {
      await this.embedStored(next.imageId, next.imageUrl);
      await yieldToEventLoop();
    }
  }

  private async runBackfill(): Promise<number> {
    const model = this.embedder.modelId;
    if (!(await this.embeddings.anyMissing(model))) {
      this.pending = 0;
      this.deferred = 0;
      return 0;
    }
    this.pending = await this.embeddings.countMissing(model);
    this.deferred = 0;
    let embedded = 0;
    let afterId = 0;
    for (;;) {
      const batch = await this.embeddings.plantImagesMissing(model, BACKFILL_BATCH, afterId);
      if (batch.length === 0) break;
      for (const { imageId, imageUrl } of batch) {
        if (this.stopped) return embedded;
        if (await this.embedStored(imageId, imageUrl)) {
          embedded++;
          this.pending = Math.max(0, this.pending - 1);
        }
        await yieldToEventLoop();
      }
      afterId = batch[batch.length - 1].imageId;
    }
    if (embedded > 0) this.log.info({ embedded }, 'plant image embeddings backfilled');
    return embedded;
  }
}
