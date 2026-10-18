import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Embedder } from '../../src/modules/recognition/domain/Recognition';
import { API, createContractApp, type ContractApp } from './harness';

let app: ContractApp;

beforeAll(async () => {
  app = await createContractApp({
    recognition: { loadEmbedder: () => new Promise<Embedder | null>(() => undefined) },
  });
});
afterAll(() => app.close());

describe('health with a model still loading', () => {
  it('stays alive and reports loop delay and memory as numbers', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/health` });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    const loop = res.body.event_loop_delay;
    for (const key of ['p50_ms', 'p99_ms', 'max_ms']) {
      expect(typeof loop[key]).toBe('number');
      expect(Number.isFinite(loop[key])).toBe(true);
    }
    expect(res.body.rss_mb).toBeGreaterThan(0);
  });

  it('reports not ready until recognition has loaded', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/health/ready` });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ready: false });
  });
});
