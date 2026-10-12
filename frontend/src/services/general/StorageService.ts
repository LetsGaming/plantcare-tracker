import { Storage } from "@ionic/storage";

/**
 * `kv` holds the token, theme, settings and every entry that outlives a logout.
 * `cache` holds account data and is dropped as a whole on logout.
 */
export type StorageArea = "kv" | "cache";

const KV_NAME = "_ionicstorage";
const CACHE_NAME = "plantcare_cache";
const MIGRATION_FLAG = "storage_split_v1";

const OBSOLETE_KEYS = [
  "sales_price_history",
  "sales_new",
  "watering_records_data",
  "plants_all",
  "substrates_all",
  "components_all",
] as const;

/**
 * High-performance wrapper around @ionic/storage.
 * Ensures safe async initialization and optimized parallel operations.
 */
class StorageService {
  private kv!: Storage;
  private cache!: Storage;

  /** Readiness semaphore */
  private readonly ready: Promise<void>;

  /** Static encoder to save memory */
  private static readonly encoder = new TextEncoder();

  constructor() {
    this.ready = this.init();
  }

  /**
   * Initializes the Ionic Storage engine.
   * @private
   */
  private async init(): Promise<void> {
    // kv keeps the name of the former single store, so tokens and settings need no move.
    [this.kv, this.cache] = await Promise.all([
      new Storage({ name: KV_NAME }).create(),
      new Storage({ name: CACHE_NAME }).create(),
    ]);
    await this.migrate();
  }

  /**
   * Runs once. Account data of the former single store is not moved: its keys
   * are replaced by the paged stores and the rest refetches, so only the large
   * obsolete entries are deleted.
   */
  private async migrate(): Promise<void> {
    if (await this.kv.get(MIGRATION_FLAG)) return;
    await Promise.all(OBSOLETE_KEYS.map((key) => this.kv.remove(key)));
    await this.kv.set(MIGRATION_FLAG, true);
  }

  private area(area: StorageArea): Storage {
    return area === "cache" ? this.cache : this.kv;
  }

  /**
   * Stores a value.
   * @param {string} key
   * @param {any} value
   */
  async set(key: string, value: any, area: StorageArea = "kv"): Promise<void> {
    await this.ready;
    return this.area(area).set(key, value);
  }

  /**
   * Retrieves a value.
   * @template T
   * @param {string} key
   * @returns {Promise<T | null>}
   */
  async get<T>(key: string, area: StorageArea = "kv"): Promise<T | null> {
    await this.ready;
    return this.area(area).get(key);
  }

  /**
   * Removes a specific key.
   * @param {string} key
   */
  async remove(key: string, area: StorageArea = "kv"): Promise<void> {
    await this.ready;
    return this.area(area).remove(key);
  }

  /** Drops the account cache without reading any value. */
  async clear(): Promise<void> {
    await this.ready;
    return this.cache.clear();
  }

  /**
   * Destroys everything in storage, including settings and the migration flag.
   */
  async clearAll(): Promise<void> {
    await this.ready;
    await Promise.all([this.kv.clear(), this.cache.clear()]);
  }

  /**
   * Batch storage update.
   */
  async setMultiple(items: { key: string; value: any }[], area: StorageArea = "kv"): Promise<void> {
    await this.ready;
    await Promise.all(items.map((i) => this.area(area).set(i.key, i.value)));
  }

  /**
   * Retrieves keys as a Record object.
   */
  async getMultiple(keys: string[], area: StorageArea = "kv"): Promise<Record<string, any>> {
    await this.ready;
    const results: Record<string, any> = {};
    await Promise.all(
      keys.map(async (key) => {
        results[key] = await this.area(area).get(key);
      }),
    );
    return results;
  }

  /**
   * Calculates total storage footprint in bytes.
   * Optimized: No extra encoder allocations.
   */
  async getSizeInBytes(): Promise<number> {
    await this.ready;
    let totalSize = 0;

    for (const storage of [this.kv, this.cache]) {
      const keys = await storage.keys();
      await Promise.all(
        keys.map(async (key) => {
          const val = await storage.get(key);
          totalSize += StorageService.encoder.encode(key).length;
          totalSize += StorageService.encoder.encode(JSON.stringify(val)).length;
        }),
      );
    }
    return totalSize;
  }
}

const storageService = new StorageService();
export default storageService;
