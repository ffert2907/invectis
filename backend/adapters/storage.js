import { LevelDatastore } from 'datastore-level';
import { MemoryDatastore } from 'datastore-core';

/**
 * A wrapper that ensures 'get' operations return a Uint8Array.
 * This is to fix a type incompatibility with the Helia stack.
 */
class DatastoreTypeWrapper {
    constructor(datastore) {
        this.store = datastore;
    }

    async get(key) {
        const value = await this.store.get(key);
        return Uint8Array.from(value);
    }

    put(key, val) { return this.store.put(key, val); }
    has(key) { return this.store.has(key); }
    delete(key) { return this.store.delete(key); }
    batch() { return this.store.batch(); }
    query(q) { return this.store.query(q); }
    open() { return this.store.open(); }
    close() { return this.store.close(); }
}

function detectEnvironment() {
  if (typeof window === 'undefined') {
    return 'node';
  }
  return 'browser';
}

/**
 * Creates, opens, and wraps a blockstore instance.
 * @param {string} path
 * @returns {Promise<DatastoreTypeWrapper | MemoryDatastore>}
 */
export async function createBlockstore(path) {
  const env = detectEnvironment();
  if (env === 'node') {
    const store = new LevelDatastore(path);
    await store.open();
    return new DatastoreTypeWrapper(store);
  }
  // For browser or other environments
  return new MemoryDatastore();
}

/**
 * Creates, opens, and wraps an index store instance.
 * @param {string} path
 * @returns {Promise<DatastoreTypeWrapper | MemoryDatastore>}
 */
export async function createIndexstore(path) {
  const env = detectEnvironment();
  if (env === 'node') {
    const store = new LevelDatastore(path);
    await store.open();
    return new DatastoreTypeWrapper(store);
  }
  // For browser or other environments
  return new MemoryDatastore();
}
