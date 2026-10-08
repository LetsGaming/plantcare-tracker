/**
 * modules/sales/infrastructure/scrapers/fieldChecks.ts
 *
 * Detects field-level problems in a scrape result the strategies accepted,
 * such as images that are missing or whose URLs do not load.
 */

import type { SourceIssue } from '../../../../core/scrapeHealth/SourceHealth';
import type { RawSaleItem } from '../../domain/Sale';

/** Share of items that may lack a field before the source counts as degraded. */
export const ISSUE_THRESHOLD = 0.2;

const PROBE_SAMPLES = 2;

/** Resolves true when the URL answers with an image content type. */
export type ImageProbe = (url: string) => Promise<boolean>;

const exceedsThreshold = (affected: number, total: number): boolean =>
  affected / total > ISSUE_THRESHOLD;

const sample = (urls: string[]): string[] => {
  if (urls.length <= PROBE_SAMPLES) return urls;
  const step = (urls.length - 1) / (PROBE_SAMPLES - 1);
  return Array.from({ length: PROBE_SAMPLES }, (_, i) => urls[Math.round(i * step)]);
};

const safeProbe = async (probe: ImageProbe, url: string): Promise<boolean> => {
  try {
    return await probe(url);
  } catch {
    return false;
  }
};

export const checkFields = async (
  items: RawSaleItem[],
  probe: ImageProbe,
): Promise<SourceIssue[]> => {
  const total = items.length;
  if (total === 0) return [];

  const issues: SourceIssue[] = [];
  const countMissing = (present: (item: RawSaleItem) => boolean): number =>
    items.filter((item) => !present(item)).length;

  const withImage = items.map((item) => item.img).filter((img): img is string => Boolean(img));
  const imagesMissing = total - withImage.length;
  if (exceedsThreshold(imagesMissing, total)) {
    issues.push({ code: 'images_missing', affected: imagesMissing, total });
  }

  const oldPriceMissing = countMissing((item) => typeof item.oldPrice === 'number');
  if (exceedsThreshold(oldPriceMissing, total)) {
    issues.push({ code: 'old_price_missing', affected: oldPriceMissing, total });
  }

  const namesMissing = countMissing((item) => Boolean(item.name?.trim()));
  if (exceedsThreshold(namesMissing, total)) {
    issues.push({ code: 'names_missing', affected: namesMissing, total });
  }

  const probed = sample(withImage);
  if (probed.length > 0) {
    const results = await Promise.all(probed.map((url) => safeProbe(probe, url)));
    const unreachable = results.filter((ok) => !ok).length;
    if (unreachable === probed.length) {
      issues.push({ code: 'images_unreachable', affected: unreachable, total: probed.length });
    }
  }

  return issues;
};
