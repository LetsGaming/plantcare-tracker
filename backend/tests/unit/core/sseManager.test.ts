import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SseManager, createSseEndpoint } from '../../../src/core/sse';

class FakeResponse extends EventEmitter {
  writableEnded = false;
  writableFinished = false;
  destroyed = false;
  writeHead = vi.fn();
  write = vi.fn(() => false);
  end = vi.fn();

  disconnect(): void {
    this.destroyed = true;
    this.emit('close');
  }
}

const asResponse = (res: FakeResponse) => res as unknown as ServerResponse;

describe('SseManager backpressure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a pending write when the client disconnects instead of draining', async () => {
    const res = new FakeResponse();
    const sse = new SseManager(asResponse(res));

    let settled = false;
    const pending = sse.sendUnique([{ id: 'a' }], 'id').then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(res.listenerCount('drain')).toBe(1);
    expect(res.listenerCount('close')).toBe(1);

    res.disconnect();
    await pending;

    expect(settled).toBe(true);
    expect(res.listenerCount('drain')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
    sse.dispose();
  });

  it('resolves a pending write on drain and removes the close listener', async () => {
    const res = new FakeResponse();
    const sse = new SseManager(asResponse(res));

    const pending = sse.sendUnique([{ id: 'a' }], 'id');
    res.emit('drain');
    await pending;

    expect(res.listenerCount('close')).toBe(0);
    sse.dispose();
  });

  it('does not write to a destroyed response', async () => {
    const res = new FakeResponse();
    const sse = new SseManager(asResponse(res));
    res.destroyed = true;

    await sse.sendUnique([{ id: 'a' }], 'id');

    expect(res.write).not.toHaveBeenCalled();
    sse.dispose();
  });

  it('lets the endpoint reach dispose and clear the heartbeat after a disconnect under backpressure', async () => {
    const res = new FakeResponse();
    const reply = {
      getHeaders: () => ({}),
      hijack: vi.fn(),
      raw: res,
    } as unknown as FastifyReply;
    const finished = vi.fn();
    const disposeSpy = vi.spyOn(SseManager.prototype, 'dispose');
    const handler = createSseEndpoint({
      name: 'Test',
      errorMessage: 'broken',
      run: async ({ sse, isAborted }) => {
        for (let i = 0; i < 5 && !isAborted(); i++) {
          await sse.sendUnique([{ id: `item-${i}` }], 'id');
        }
      },
    });

    const running = handler({} as FastifyRequest, reply).then(finished);
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    res.disconnect();
    await running;

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    disposeSpy.mockRestore();
  });
});
