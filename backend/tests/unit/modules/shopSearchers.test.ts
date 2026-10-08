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
