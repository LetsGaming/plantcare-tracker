/**
 * core/sse/SseManager.ts
 *
 * Typed Server-Sent-Events stream manager.
 *
 * Originally lived in modules/sales/presentation and was imported
 * across module boundaries by moreInfo — a layering violation (one
 * module's presentation layer depending on another's). SSE is a
 * cross-cutting transport concern, so it now lives in core alongside
 * the shared endpoint lifecycle in sseEndpoint.ts.
 */

import type { Response } from 'express';
import { SSE } from '../config';

export class SseManager {
  private readonly sentIds = new Set<string>();
  private totalSent = 0;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private readonly maxChunkSize: number;

  constructor(
    private readonly res: Response,
    maxChunkSize: number = SSE.MAX_CHUNK_BYTES,
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
    }, SSE.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Sends only the items whose id has not been sent on this stream yet.
   * Large batches are split so no single frame exceeds maxChunkSize.
   */
  async sendUnique<T>(items: T[], idKey: keyof T): Promise<void> {
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

  /**
   * Emits the terminal `done` event and closes the stream.
   * Defaults to `{ total }` (used by sales); callers may pass their own
   * final payload (moreInfo sends `{ status: "completed" }`).
   */
  async end(finalMessage?: Record<string, unknown>): Promise<void> {
    const stats = finalMessage ?? { total: this.totalSent };
    clearInterval(this.heartbeat);
    this.res.write(`event: ${SSE.EVENT.DONE}\ndata: ${JSON.stringify(stats)}\n\n`);
    return new Promise((resolve) => {
      this.res.end(() => resolve());
    });
  }

  /**
   * Emits a named `error` event and closes the stream. Safe to call
   * after a partial write; no-ops if the stream is already ended.
   */
  fail(message: string): void {
    clearInterval(this.heartbeat);
    if (this.res.writableEnded) return;
    this.res.write(
      `event: ${SSE.EVENT.ERROR}\ndata: ${JSON.stringify({ message })}\n\n`,
    );
    this.res.end();
  }

  /** Stops the heartbeat without writing — used when the client disconnects. */
  dispose(): void {
    clearInterval(this.heartbeat);
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
