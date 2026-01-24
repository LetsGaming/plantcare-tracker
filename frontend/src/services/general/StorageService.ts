import { Storage } from "@ionic/storage";

/**
 * High-performance wrapper around @ionic/storage.
 * Ensures safe async initialization and optimized parallel operations.
 */
class StorageService {
  /** Internal Ionic Storage instance */
  private storage!: Storage;

  /**
   * Promise that resolves once the storage engine is fully initialized.
   * All public methods await this to guarantee readiness.
   */
  private readonly ready: Promise<void>;

  /** Shared encoder instance to avoid repeated allocations */
  private readonly encoder = new TextEncoder();

  constructor() {
    this.ready = this.init();
  }

  /**
   * Initializes the Ionic Storage engine.
   */
  private async init(): Promise<void> {
    const storage = new Storage();
    this.storage = await storage.create();
  }

  /**
   * Stores a value under the given key.
   *
   * @param key Unique storage key
   * @param value Any serializable value
   */
  async set(key: string, value: any): Promise<void> {
    await this.ready;
    await this.storage.set(key, value);
  }

  /**
   * Retrieves a value by key.
   *
   * @template T
   * @param key Storage key
   * @returns The stored value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    await this.ready;
    return this.storage.get(key);
  }

  /**
   * Removes a value from storage.
   *
   * @param key Storage key to remove
   */
  async remove(key: string): Promise<void> {
    await this.ready;
    await this.storage.remove(key);
  }

  /**
   * Checks whether a key exists in storage.
   *
   * @param key Storage key to check
   * @returns True if the key exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  /**
   * Clears all items EXCEPT those with a `keepOnClear` flag.
   * All reads and removals are fully parallelized.
   */
  async clear(): Promise<void> {
    await this.ready;

    const keys = await this.storage.keys();

    const items = await Promise.all(
      keys.map(async (key) => ({
        key,
        value: await this.storage.get(key),
      })),
    );

    await Promise.all(
      items
        .filter((item) => !item.value || !item.value.keepOnClear)
        .map((item) => this.storage.remove(item.key)),
    );
  }

  /**
   * Clears all items from storage, including protected ones.
   */
  async clearAll(): Promise<void> {
    await this.ready;
    await this.storage.clear();
  }

  /**
   * Returns all keys currently stored.
   *
   * @returns Array of storage keys
   */
  async keys(): Promise<string[]> {
    await this.ready;
    return this.storage.keys();
  }

  /**
   * Stores multiple key-value pairs in parallel.
   *
   * @param items Array of key-value objects
   */
  async setMultiple(items: { key: string; value: any }[]): Promise<void> {
    await this.ready;
    await Promise.all(
      items.map((item) => this.storage.set(item.key, item.value)),
    );
  }

  /**
   * Retrieves multiple values in parallel.
   *
   * @param keys Array of storage keys
   * @returns Object mapping keys to their values
   */
  async getMultiple(keys: string[]): Promise<Record<string, any>> {
    await this.ready;

    const result: Record<string, any> = {};

    await Promise.all(
      keys.map(async (key) => {
        result[key] = await this.storage.get(key);
      }),
    );

    return result;
  }

  /**
   * Removes multiple keys from storage in parallel.
   *
   * @param keys Array of keys to remove
   */
  async removeMultiple(keys: string[]): Promise<void> {
    await this.ready;
    await Promise.all(keys.map((key) => this.storage.remove(key)));
  }

  /**
   * Returns the number of stored entries.
   *
   * @returns Number of stored items
   */
  async length(): Promise<number> {
    await this.ready;
    return this.storage.length();
  }

  /**
   * Calculates the approximate total size of storage contents in bytes.
   * Uses parallel reads and avoids unnecessary allocations.
   *
   * @returns Total storage size in bytes
   */
  async getSizeInBytes(): Promise<number> {
    await this.ready;

    const keys = await this.storage.keys();
    let totalSize = 0;

    await Promise.all(
      keys.map(async (key) => {
        const value = await this.storage.get(key);

        totalSize +=
          this.encoder.encode(key).length +
          this.encoder.encode(JSON.stringify(value)).length;
      }),
    );

    return totalSize;
  }
}

const storageService = new StorageService();
export default storageService;
