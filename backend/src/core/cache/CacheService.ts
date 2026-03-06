/**
 * core/cache/CacheService.ts
 *
 * The domain-facing cache interface.
 * Application layer imports only this interface — never a concrete impl.
 * Concrete implementations (NodeCache, Redis, etc.) live in infrastructure.
 */

export interface CacheService {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlSeconds?: number): void;
  delete(key: string): void;
  flush(): void;
}
