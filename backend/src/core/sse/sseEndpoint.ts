/**
 * core/sse/sseEndpoint.ts
 *
 * Shared lifecycle for every SSE endpoint.
 *
 * Before this helper, salesController.ts and moreInfoRoutes.ts each
 * hand-rolled the same sequence: construct an SseManager, register a
 * `close` listener to detect client disconnects, run the work, emit a
 * terminal `done` event, and on failure write a named `error` event if
 * the stream was still open. Two copies of that plumbing had already
 * drifted (different error messages, moreInfo wrote its error frame by
 * hand). This factory owns the sequence once; endpoints provide only
 * their work and their endpoint-specific messages.
 *
 * The `prepare` hook runs BEFORE the stream is opened. Anything thrown
 * there (typically a ValidationError from parsing query parameters) is
 * forwarded to the global error handler and answered as a normal JSON
 * error envelope — once the stream is open, a 200 and the SSE headers
 * are already on the wire, so failures after that point can only be
 * reported as a named `error` event.
 */

import type { OutgoingHttpHeaders } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SseManager } from './SseManager';
import { createModuleLogger } from '../logging';

const log = createModuleLogger('SseEndpoint');

export interface SseContext {
  /** The open stream — send payload events through this. */
  sse: SseManager;
  /** True once the client has disconnected; long tasks should poll this. */
  isAborted: () => boolean;
  request: FastifyRequest;
  reply: FastifyReply;
}

export interface SseEndpointOptions<TPrepared = void> {
  /** Module tag used in the error log line, e.g. "Sales" or "MoreInfo". */
  name: string;
  /** Message sent in the `error` event when run() throws mid-stream. */
  errorMessage: string;
  /**
   * Payload for the terminal `done` event. Omit to use the SseManager
   * default `{ total }`. Evaluated after run() resolves.
   */
  doneMessage?: () => Record<string, unknown>;
  /**
   * Pre-stream step: parse and validate the request. Errors thrown here
   * become regular JSON error responses.
   */
  prepare?: (request: FastifyRequest) => TPrepared;
  /** The endpoint's actual work. Throwing triggers the `error` event. */
  run: (ctx: SseContext, prepared: TPrepared) => Promise<void>;
}

export const createSseEndpoint =
  <TPrepared = void>(options: SseEndpointOptions<TPrepared>) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Throws here (validation) propagate to the error handler as a normal JSON answer.
    const prepared = options.prepare ? options.prepare(request) : (undefined as TPrepared);

    // From here on the response is written by hand. Headers set by earlier
    // hooks (CORS, request id) are carried over explicitly.
    const inherited = reply.getHeaders() as OutgoingHttpHeaders;
    reply.hijack();
    const raw = reply.raw;

    let aborted = false;
    raw.on('close', () => {
      if (!raw.writableFinished) aborted = true;
    });

    const sse = new SseManager(raw, inherited);

    try {
      await options.run({ sse, isAborted: () => aborted, request, reply }, prepared);

      if (!aborted) {
        await sse.end(options.doneMessage?.());
      } else {
        sse.dispose();
      }
    } catch (err: unknown) {
      log.error(`${options.name} SSE stream error`, { err });
      sse.fail(options.errorMessage);
    }
  };
