/**
 * tests/unit/modules/shopSearchers.test.ts
 *
 * Shop link searchers: structured search first, HTML search page second,
 * with the outcome reported as source health. Axios is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequest, mockGet } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('axios', () => ({
  default: Object.assign(mockRequest, { get: mockGet }),
}));

import { createPlantLinkSearchers } from '../../../src/modules/moreInfo/infrastructure/PlantLinkSearchers';
import { NodeCacheAdapter } from '../../../src/core/cache';
import type { ScrapeOutcome } from '../../../src/core/scrapeHealth';

const suggest = (...handles: string[]) => ({
  data: { resources: { results: { products: handles.map((handle) => ({ handle })) } } },
});

const jungleLeavesHtml = `
  <product-card><a class="product-card-title" href="/products/monstera-deliciosa-variegata">Monstera</a></product-card>
  <product-card><a class="product-card-title" href="/products/pilea">Pilea</a></product-card>`;

const setup = () => {
  const outcomes: ScrapeOutcome[] = [];
  const [jungleLeaves] = createPlantLinkSearchers(new NodeCacheAdapter(), {
    record: (o) => outcomes.push(o),
  });
  return { search: jungleLeaves, outcomes };
};

beforeEach(() => {
  mockRequest.mockReset();
  mockGet.mockReset();
});

describe('shop link searchers', () => {
  it('uses the Shopify suggest endpoint and reports ok', async () => {
    mockRequest.mockResolvedValue(suggest('monstera-deliciosa-variegata', 'pilea'));
    const { search, outcomes } = setup();

    await expect(search('Monstera deliciosa')).resolves.toBe(
      'https://www.jungle-leaves.de/products/monstera-deliciosa-variegata',
    );

    expect(mockGet).not.toHaveBeenCalled();
    expect(outcomes).toEqual([
      expect.objectContaining({
        key: 'search:jungleLeaves',
        kind: 'search',
        strategy: 'shopifyJson',
        usedFallback: false,
        itemCount: 2,
        issues: [],
      }),
    ]);
  });

  it('keeps search health keys apart from the sales source of the same shop', async () => {
    mockRequest.mockResolvedValue(suggest('pilea'));
    const { search, outcomes } = setup();
    await search('Pilea');
    expect(outcomes[0].key).not.toBe('jungleLeaves');
  });

  it('falls back to the HTML search page when the suggest response changes shape', async () => {
    mockRequest.mockResolvedValue({ data: { somethingElse: true } });
    mockGet.mockResolvedValue({ data: jungleLeavesHtml });
    const { search, outcomes } = setup();

    await expect(search('Monstera deliciosa')).resolves.toBe(
      'https://www.jungle-leaves.de/products/monstera-deliciosa-variegata',
    );

    expect(outcomes[0]).toMatchObject({ strategy: 'selector', usedFallback: true });
    expect(outcomes[0].error).toContain('shopifyJson: unexpected response structure');
  });

  it('reports failing and returns null when both searches fail', async () => {
    mockRequest.mockRejectedValue(new Error('503'));
    mockGet.mockRejectedValue(new Error('timeout'));
    const { search, outcomes } = setup();

    await expect(search('Monstera deliciosa')).resolves.toBeNull();

    expect(outcomes[0]).toMatchObject({ strategy: null });
    expect(outcomes[0].error).toContain('shopifyJson: 503');
    expect(outcomes[0].error).toContain('selector: timeout');
  });

  it('treats zero results from a valid suggest response as a normal answer, not a failure', async () => {
    mockRequest.mockResolvedValue(suggest());
    const { search, outcomes } = setup();

    await expect(search('Unobtainium')).resolves.toBeNull();

    expect(outcomes[0]).toMatchObject({ strategy: 'shopifyJson', itemCount: 0 });
  });

  it('does not report anything for an empty HTML result, which could be a missing plant or broken markup', async () => {
    mockRequest.mockResolvedValue({ data: {} });
    mockGet.mockResolvedValue({ data: '<html></html>' });
    const { search, outcomes } = setup();

    await expect(search('Unobtainium')).resolves.toBeNull();

    expect(outcomes).toHaveLength(0);
  });
});

describe('API link searchers', () => {
  const setupApi = () => {
    const outcomes: ScrapeOutcome[] = [];
    const cache = new NodeCacheAdapter();
    const searchers = createPlantLinkSearchers(cache, { record: (o) => outcomes.push(o) });
    return { wikipedia: searchers[4], gbif: searchers[5], outcomes };
  };

  it('reports a failing Wikipedia request instead of passing as "no link"', async () => {
    mockRequest.mockRejectedValue(new Error('503'));
    const { wikipedia, outcomes } = setupApi();

    await expect(wikipedia('Monstera deliciosa')).resolves.toBeNull();

    expect(outcomes).toEqual([
      expect.objectContaining({
        key: 'search:wikipedia',
        kind: 'search',
        strategy: null,
        error: '503',
      }),
    ]);
  });

  it('reports ok for a successful lookup and serves the repeat from the cache', async () => {
    mockRequest.mockResolvedValue({
      data: { results: [{ species: 'Monstera deliciosa', nubKey: 42 }] },
    });
    const { gbif, outcomes } = setupApi();

    await expect(gbif('Monstera deliciosa')).resolves.toBe('https://www.gbif.org/species/42');
    await expect(gbif('Monstera deliciosa')).resolves.toBe('https://www.gbif.org/species/42');

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual([
      expect.objectContaining({ key: 'search:gbif', strategy: 'api', itemCount: 1, error: null }),
    ]);
  });

  it('does not cache a failure, so the next lookup retries', async () => {
    mockRequest.mockRejectedValueOnce(new Error('timeout'));
    mockRequest.mockResolvedValueOnce({ data: { query: { search: [] } } });
    const { wikipedia, outcomes } = setupApi();

    await wikipedia('Calathea');
    await wikipedia('Calathea');

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(outcomes.map((o) => o.strategy)).toEqual([null, 'api']);
  });
});
