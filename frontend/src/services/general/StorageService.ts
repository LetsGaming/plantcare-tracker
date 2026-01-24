import { Storage } from "@ionic/storage";

class StorageService {
  private storage: Storage | null = null;

  constructor() {
    this.init();
  }

  // Initialize Ionic Storage
  async init() {
    const storage = new Storage();
    this.storage = await storage.create();
  }

  /**
   * Set an item in storage
   * @param key Key for the item
   * @param value Value to store (can be string, object, array, etc.)
   */
  async set(key: string, value: any): Promise<void> {
    if (this.storage) {
      await this.storage.set(key, value);
    }
  }

  /**
   * Get an item from storage
   * @param key Key for the item
   * @returns The value stored or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.storage) {
      return await this.storage.get(key);
    }
    return null;
  }

  /**
   * Remove an item from storage
   * @param key Key for the item to remove
   */
  async remove(key: string): Promise<void> {
    if (this.storage) {
      await this.storage.remove(key);
    }
  }

  /**
   * Check if a key exists in storage
   * @param key Key to check
   * @returns True if key exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Clear items that DON'T have the keepOnClear flag.
   *  Uses Promise.all for 10x faster performance.
   */
  async clear(): Promise<void> {
    if (!this.storage) {
      return;
    }
    const keys = await this.storage.keys();

    // 1. Start all "get" requests at once
    const allItems = await Promise.all(
      keys.map(async (key) => ({ key, val: await this.storage!.get(key) })),
    );

    // 2. Filter for items that should be removed
    const keysToRemove = allItems
      .filter((item) => !item.val || !item.val.keepOnClear)
      .map((item) => item.key);

    // 3. Remove them all in parallel
    await Promise.all(keysToRemove.map((key) => this.storage!.remove(key)));
  }

  /**
   * Clear all items in storage, including those with keepOnClear flag
   */
  async clearAll(): Promise<void> {
    if (this.storage) {
      await this.storage.clear();
    }
  }

  /**
   * Get all keys in storage
   * @returns Array of keys
   */
  async keys(): Promise<string[]> {
    if (this.storage) {
      return await this.storage.keys();
    }
    return [];
  }

  /**
   * Get the number of items stored
   * @returns Number of items in storage
   */
  async length(): Promise<number> {
    if (this.storage) {
      return await this.storage.length();
    }
    return 0;
  }

  /**
   * Set multiple items at once
   * @param items An array of key-value pairs
   */
  async setMultiple(items: { key: string; value: any }[]): Promise<void> {
    if (this.storage) {
      const promises = items.map((item) =>
        this.storage!.set(item.key, item.value),
      );
      await Promise.all(promises);
    }
  }

  /**
   * Get multiple items at once
   * @param keys An array of keys to fetch
   * @returns An object with key-value pairs
   */
  async getMultiple(keys: string[]): Promise<{ [key: string]: any }> {
    const result: { [key: string]: any } = {};
    if (this.storage) {
      const promises = keys.map(async (key) => {
        result[key] = await this.storage!.get(key);
      });
      await Promise.all(promises);
    }
    return result;
  }

  /**
   * Remove multiple items at once
   * @param keys An array of keys to remove
   */
  async removeMultiple(keys: string[]): Promise<void> {
    if (this.storage) {
      const promises = keys.map((key) => this.storage!.remove(key));
      await Promise.all(promises);
    }
  }
}

const storageService = new StorageService();
export default storageService;
