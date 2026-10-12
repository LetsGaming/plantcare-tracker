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

import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { SSE } from '../config';

export class SseManager {
  private readonly sentIds = new Set<string>();
  private totalSent = 0;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private readonly maxChunkSize: number;

  constructor(
    private readonly res: ServerResponse,
    /** Headers already decided by the framework (CORS, request id). */
    inheritedHeaders: OutgoingHttpHeaders = {},
    maxChunkSize: number = SSE.MAX_CHUNK_BYTES,
  ) {
    this.maxChunkSize = maxChunkSize;
    res.writeHead(200, {
      ...inheritedHeaders,
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
    await this.emit(JSON.stringify(data));
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
      this.res.once('finish', resolve);
      this.res.end();
    });
  }

  /**
   * Emits a named `error` event and closes the stream. Safe to call
   * after a partial write; no-ops if the stream is already ended.
   */
  fail(message: string): void {
    clearInterval(this.heartbeat);
    if (this.res.writableEnded) return;
    this.res.write(`event: ${SSE.EVENT.ERROR}\ndata: ${JSON.stringify({ message })}\n\n`);
    this.res.end();
  }

  /** Stops the heartbeat without writing — used when the client disconnects. */
  dispose(): void {
    clearInterval(this.heartbeat);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Each item is serialized once; a frame's JSON array (brackets and commas
   * included) stays within maxChunkSize unless a single item exceeds it.
   */
  private async chunkAndSend<T>(dataArray: T[]): Promise<void> {
    let batch: string[] = [];
    let batchBytes = 0;

    for (const item of dataArray) {
      const json = JSON.stringify(item);
      const itemBytes = Buffer.byteLength(json, 'utf8');

      if (batch.length > 0 && batchBytes + 1 + itemBytes > this.maxChunkSize) {
        await this.emit(`[${batch.join(',')}]`);
        batch = [];
        batchBytes = 0;
      }

      batchBytes += batch.length === 0 ? 2 + itemBytes : 1 + itemBytes;
      batch.push(json);
    }

    if (batch.length > 0) {
      await this.emit(`[${batch.join(',')}]`);
    }
  }

  private emit(json: string): Promise<void> {
    return new Promise((resolve) => {
      const canWrite = this.res.write(`data: ${json}\n\n`);
      (this.res as ServerResponse & { flush?: () => void }).flush?.();

      if (!canWrite) {
        this.res.once('drain', resolve);
      } else {
        process.nextTick(resolve);
      }
    });
  }
}
