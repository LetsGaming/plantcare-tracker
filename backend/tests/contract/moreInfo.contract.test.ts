import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlantGuideStreamer } from '../../src/modules/moreInfo/domain/PlantInfo';
import { API, createContractApp, type ContractApp } from './harness';
import { parseSse, ticketFor } from './support';

interface GuideCall {
  plantName: string;
  htmlFormatting: boolean;
  language?: string;
}

const guideCalls: GuideCall[] = [];
const searcherCalls: string[] = [];
let guideBehavior: 'ok' | 'fail' = 'ok';

const guide: PlantGuideStreamer = {
  streamPlantCare: async (plantName, htmlFormatting, onChunk, language) => {
    guideCalls.push({ plantName, htmlFormatting, language });
    if (guideBehavior === 'fail') throw new Error('upstream down');
    await onChunk('## Light\n');
    await onChunk('Bright indirect light.');
  },
};

let app: ContractApp;

beforeAll(async () => {
  app = await createContractApp({
    moreInfo: {
      guideStreamer: guide,
      linkSearchers: [
        async (name) => {
          searcherCalls.push(name);
          return `https://wiki.example/${encodeURIComponent(name)}`;
        },
        async () => null,
        async () => {
          throw new Error('searcher crashed');
        },
      ],
    },
  });
});
afterAll(() => app.close());

const stream = async (query: string, headers: Record<string, string> = {}) => {
  const session = await app.signIn('user');
  const ticket = await ticketFor(app, session.auth);
  return app.client.request({
    method: 'get',
    url: `${API}/more-info?ticket=${ticket}&${query}`,
    headers,
  });
};

describe('GET /more-info (SSE)', () => {
  it('streams AI chunks and links and ends with a completed event', async () => {
    guideCalls.length = 0;
    const res = await stream('plantName=Monstera%20deliciosa');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    const frames = parseSse(res.text);
    expect(frames.at(-1)).toEqual({ event: 'done', data: { status: 'completed' } });

    const payloads = frames.filter((f) => f.event === 'message').map((f) => f.data);
    expect(payloads).toContainEqual({ type: 'ai_chunk', value: '## Light\n' });
    expect(payloads).toContainEqual({ type: 'ai_chunk', value: 'Bright indirect light.' });
    expect(payloads).toContainEqual({
      type: 'link',
      value: 'https://wiki.example/Monstera%20deliciosa',
    });
    expect(payloads.filter((p) => (p as { type: string }).type === 'link')).toHaveLength(1);
  });

  it('cleans the plant name, defaults to English and passes the formatting flag', async () => {
    guideCalls.length = 0;
    searcherCalls.length = 0;
    await stream('plantName=Ficus%20(Fiddle)%20lyrata!&htmlFormatting=true');
    expect(guideCalls).toEqual([
      { plantName: 'Ficus lyrata', htmlFormatting: true, language: 'en' },
    ]);
    expect(searcherCalls).toEqual(['Ficus lyrata']);
  });

  it('prefers the lang query parameter and falls back to Accept-Language', async () => {
    guideCalls.length = 0;
    await stream('plantName=Aloe&lang=de');
    await stream('plantName=Aloe', { 'Accept-Language': 'fr-FR,fr;q=0.9' });
    expect(guideCalls.map((c) => c.language)).toEqual(['de', 'fr-FR']);
  });

  it('survives failing and empty link searchers', async () => {
    const res = await stream('plantName=Pothos');
    const frames = parseSse(res.text);
    expect(frames.some((f) => f.event === 'error')).toBe(false);
    expect(frames.at(-1)!.event).toBe('done');
  });

  it('ends with an error event and no done event when the guide stream fails', async () => {
    guideBehavior = 'fail';
    try {
      const res = await stream('plantName=Calathea');
      const frames = parseSse(res.text);
      expect(frames.at(-1)).toEqual({
        event: 'error',
        data: { message: 'Information stream interrupted' },
      });
      expect(frames.some((f) => f.event === 'done')).toBe(false);
    } finally {
      guideBehavior = 'ok';
    }
  });
});

describe('request validation and ticket handling', () => {
  it('answers 401 without a ticket', async () => {
    const res = await app.client.request({ method: 'get', url: `${API}/more-info?plantName=Aloe` });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('No authentication ticket provided');
  });

  it('answers 403 for an unknown ticket', async () => {
    const res = await app.client.request({
      method: 'get',
      url: `${API}/more-info?ticket=nope&plantName=Aloe`,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Invalid or expired ticket');
  });

  it('burns the ticket on first use', async () => {
    const session = await app.signIn('user');
    const ticket = await ticketFor(app, session.auth);
    const url = `${API}/more-info?ticket=${ticket}&plantName=Aloe`;
    expect((await app.client.request({ method: 'get', url })).status).toBe(200);
    expect((await app.client.request({ method: 'get', url })).status).toBe(403);
  });

  it('answers 403 for an expired ticket', async () => {
    const session = await app.signIn('user');
    const ticket = await ticketFor(app, session.auth);
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      const res = await app.client.request({
        method: 'get',
        url: `${API}/more-info?ticket=${ticket}&plantName=Aloe`,
      });
      expect(res.status).toBe(403);
    } finally {
      Date.now = realNow;
    }
  });

  it('rejects a missing or over-long plantName with a JSON 400 before the stream opens', async () => {
    const missing = await stream('lang=en');
    expect(missing.status).toBe(400);
    expect(String(missing.headers['content-type'])).toContain('application/json');
    expect(missing.body.error.type).toBe('ValidationError');
    const long = await stream(`plantName=${'x'.repeat(101)}`);
    expect(long.status).toBe(400);
    expect(long.body.error.fields).toHaveProperty('plantName');
  });

  it('consumes the ticket even when validation fails', async () => {
    const session = await app.signIn('user');
    const ticket = await ticketFor(app, session.auth);
    const bad = await app.client.request({
      method: 'get',
      url: `${API}/more-info?ticket=${ticket}`,
    });
    expect(bad.status).toBe(400);
    const retry = await app.client.request({
      method: 'get',
      url: `${API}/more-info?ticket=${ticket}&plantName=Aloe`,
    });
    expect(retry.status).toBe(403);
  });
});

describe('known defects', () => {
  it('rejects the seeded guest ticket because the guest id is 0 (BUG-02)', async () => {
    const guest = app.session({ id: 0, username: 'guest', role: 'guest' });
    const ticket = await ticketFor(app, guest.auth);
    const res = await app.client.request({
      method: 'get',
      url: `${API}/more-info?ticket=${ticket}&plantName=Aloe`,
    });
    expect(res.status).toBe(403);
  });
});
