import { Storage } from "@ionic/storage";

/**
 * High-performance wrapper around @ionic/storage.
 * Ensures safe async initialization and optimized parallel operations.
 */
class StorageService {
  /** Internal Ionic Storage instance */
  private storage!: Storage;

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
    const storage = new Storage();
    this.storage = await storage.create();
  }

  /**
   * Stores a value.
   * @param {string} key
   * @param {any} value
   */
  async set(key: string, value: any): Promise<void> {
    await this.ready;
    return this.storage.set(key, value);
  }

  /**
   * Retrieves a value.
   * @template T
   * @param {string} key
   * @returns {Promise<T | null>}
   */
  async get<T>(key: string): Promise<T | null> {
    await this.ready;
    return this.storage.get(key);
  }

  /**
   * Removes a specific key.
   * @param {string} key
   */
  async remove(key: string): Promise<void> {
    await this.ready;
    return this.storage.remove(key);
  }

  /**
   * Clears non-protected items.
   * Optimized: Uses Promise.all with a single pass through keys.
   */
  async clear(): Promise<void> {
    await this.ready;
    const keys = await this.storage.keys();

    await Promise.all(
      keys.map(async (key) => {
        const val = await this.storage.get(key);
        if (!val?.keepOnClear) {
          return this.storage.remove(key);
        }
      }),
    );
  }

  /**
   * Destroys everything in storage.
   */
  async clearAll(): Promise<void> {
    await this.ready;
    return this.storage.clear();
  }

  /**
   * Batch storage update.
   */
  async setMultiple(items: { key: string; value: any }[]): Promise<void> {
    await this.ready;
    await Promise.all(items.map((i) => this.storage.set(i.key, i.value)));
  }

  /**
   * Retrieves keys as a Record object.
   */
  async getMultiple(keys: string[]): Promise<Record<string, any>> {
    await this.ready;
    const results: Record<string, any> = {};
    await Promise.all(
      keys.map(async (key) => {
        results[key] = await this.storage.get(key);
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
    const keys = await this.storage.keys();
    let totalSize = 0;

    await Promise.all(
      keys.map(async (key) => {
        const val = await this.storage.get(key);
        totalSize += StorageService.encoder.encode(key).length;
        totalSize += StorageService.encoder.encode(JSON.stringify(val)).length;
      }),
    );
    return totalSize;
  }
}

const storageService = new StorageService();
export default storageService;
