import { LevelDatastore } from 'datastore-level';
import { MemoryDatastore } from 'datastore-core';

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
 * Creates a blockstore instance based on the environment.
 * @param {string} path - The path or name for the datastore.
 * @returns {Promise<import('interface-datastore').Datastore>}
 */
export async function createBlockstore(path) {
  const env = detectEnvironment();

  switch (env) {
    case 'node':
      const store = new LevelDatastore(path);
      await store.open();
      return store;
    case 'browser':
      // TODO: Implement IndexedDB blockstore for browsers.
      return new MemoryDatastore();
    default:
      throw new Error('Unsupported environment');
  }
}

/**
 * Creates an index store instance based on the environment.
 * @param {string} path - The path or name for the datastore.
 * @returns {Promise<import('interface-datastore').Datastore>}
 */
export async function createIndexstore(path) {
  const env = detectEnvironment();

  switch (env) {
    case 'node':
      const store = new LevelDatastore(path);
      await store.open();
      return store;
    case 'browser':
      // TODO: Implement IndexedDB index store for browsers.
      return new MemoryDatastore();
    default:
      throw new Error('Unsupported environment');
  }
}
