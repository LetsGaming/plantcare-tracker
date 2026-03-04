/**
 * core/cache/NodeCacheAdapter.ts
 *
 * Concrete implementation of CacheService backed by node-cache.
 * This is the V2 equivalent of the ad-hoc `new NodeCache()` calls
 * scattered across V1 controllers — now a single, injectable service.
 */

import NodeCache from 'node-cache';
import type { CacheService } from './CacheService';

export class NodeCacheAdapter implements CacheService {
  private readonly cache: NodeCache;

  /**
   * @param defaultTtlSeconds  Default TTL in seconds (default: 24 hours)
   * @param checkPeriodSeconds How often to purge expired keys (default: 1 hour)
   */
  constructor(defaultTtlSeconds = 86_400, checkPeriodSeconds = 3_600) {
    this.cache = new NodeCache({
      stdTTL: defaultTtlSeconds,
      checkperiod: checkPeriodSeconds,
      useClones: false, // avoid deep-cloning overhead for large scrape payloads
    });
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttlSeconds?: number): void {
    if (ttlSeconds !== undefined) {
      this.cache.set(key, value, ttlSeconds);
    } else {
      this.cache.set(key, value);
    }
  }

  delete(key: string): void {
    this.cache.del(key);
  }

  flush(): void {
    this.cache.flushAll();
  }
}
