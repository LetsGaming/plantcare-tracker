/**
 * modules/sales/presentation/SseManager.ts
 *
 * Typed SSE stream manager. Ported from V1's SSEManager class in
 * responseUtils.js, now with proper TypeScript types and a generic
 * interface that can be reused by other SSE endpoints (moreInfo).
 */

import type { Response } from 'express';

export class SseManager {
  private readonly sentIds = new Set<string>();
  private totalSent = 0;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private readonly maxChunkSize: number;

  constructor(
    private readonly res: Response,
    maxChunkSize = 16_384,
  ) {
    this.maxChunkSize = maxChunkSize;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    this.heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, 20_000);
  }

  async sendUnique<T>(
    items: T[],
    idKey: keyof T,
  ): Promise<void> {
    const unique = items.filter((item) => {
      const id = String(item[idKey]);
      if (id && !this.sentIds.has(id)) {
        this.sentIds.add(id);
        return true;
      }
      return false;
    });

    if (unique.length > 0) {
      this.totalSent += unique.length;
      await this.chunkAndSend(unique);
    }
  }

  async send<T>(data: T): Promise<void> {
    await this.emit(data);
  }

  async end(finalMessage?: Record<string, unknown>): Promise<void> {
    const stats = finalMessage ?? { total: this.totalSent };
    clearInterval(this.heartbeat);
    this.res.write(`event: done\ndata: ${JSON.stringify(stats)}\n\n`);
    return new Promise((resolve) => {
      this.res.end(() => resolve());
    });
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async chunkAndSend<T>(dataArray: T[]): Promise<void> {
    let currentBatch: T[] = [];
    let currentBatchSize = 0;

    for (const item of dataArray) {
      const itemStr = JSON.stringify(item);
      const itemSize = Buffer.byteLength(itemStr, 'utf8');

      if (currentBatchSize + itemSize > this.maxChunkSize && currentBatch.length > 0) {
        await this.emit(currentBatch);
        currentBatch = [];
        currentBatchSize = 0;
      }

      currentBatch.push(item);
      currentBatchSize += itemSize;
    }

    if (currentBatch.length > 0) {
      await this.emit(currentBatch);
    }
  }

  private emit<T>(data: T): Promise<void> {
    return new Promise((resolve) => {
      const canWrite = this.res.write(`data: ${JSON.stringify(data)}\n\n`);
      (this.res as Response & { flush?: () => void }).flush?.();

      if (!canWrite) {
        this.res.once('drain', resolve);
      } else {
        process.nextTick(resolve);
      }
    });
  }
}
