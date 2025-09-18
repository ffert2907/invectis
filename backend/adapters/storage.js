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
  return typeof window === 'undefined' ? 'node' : 'browser';
}

async function createNodeDatastore(path) {
    const store = new LevelDatastore(path);
    await store.open();
    return new DatastoreTypeWrapper(store);
}

export async function createBlockstore(path) {
  if (detectEnvironment() === 'node') {
    return createNodeDatastore(path);
  }
  return new MemoryDatastore();
}

export async function createIndexstore(path) {
  if (detectEnvironment() === 'node') {
    return createNodeDatastore(path);
  }
  return new MemoryDatastore();
}
