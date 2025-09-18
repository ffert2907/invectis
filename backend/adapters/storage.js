import { LevelDatastore } from 'datastore-level';
import { MemoryDatastore } from 'datastore-core';

/**
 * A wrapper that ensures 'get' operations return a Uint8Array.
 * This is to fix a type incompatibility with the Helia stack,
 * replicating the essential functionality of the old DatastoreWrapper.
 */
class DatastoreTypeWrapper {
    constructor(datastore) {
        this.store = datastore;
    }

    async get(key) {
        const value = await this.store.get(key);
        // Helia/IPFS expects Uint8Array. LevelDB may return Buffer.
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


/**
 * Detects the current environment.
 * @returns {'node' | 'browser'}
 */
function detectEnvironment() {
  if (typeof window === 'undefined') {
    return 'node';
  }
  return 'browser';
}

/**
 * Creates, opens, and wraps a blockstore instance based on the environment.
 * @param {string} path - The path or name for the datastore.
 * @returns {Promise<DatastoreTypeWrapper | MemoryDatastore>}
 */
export async function createBlockstore(path) {
  const env = detectEnvironment();

  switch (env) {
    case 'node':
      const store = new LevelDatastore(path);
      await store.open();
      // Wrap the store to handle type conversion
      return new DatastoreTypeWrapper(store);
    case 'browser':
      // TODO: Implement IndexedDB blockstore for browsers.
      return new MemoryDatastore();
    default:
      throw new Error('Unsupported environment');
  }
}

/**
 * Creates, opens, and wraps an index store instance based on the environment.
 * @param {string} path - The path or name for the datastore.
 * @returns {Promise<DatastoreTypeWrapper | MemoryDatastore>}
 */
export async function createIndexstore(path) {
  const env = detectEnvironment();

  switch (env) {
    case 'node':
      const store = new LevelDatastore(path);
      await store.open();
       // Wrap the store to handle type conversion
      return new DatastoreTypeWrapper(store);
    case 'browser':
      // TODO: Implement IndexedDB index store for browsers.
      return new MemoryDatastore();
    default:
      throw new Error('Unsupported environment');
  }
}
