import { LevelDatastore } from 'datastore-level';
import { MemoryDatastore } from 'datastore-core';

/**
 * Detects the current environment.
 * For this project, we'll simplify by checking for the 'window' object.
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
 * The blockstore is the main storage for IPLD blocks.
 *
 * @param {string} path - The path or name for the datastore.
 * @returns {import('interface-datastore').Datastore}
 */
export function createBlockstore(path) {
  const env = detectEnvironment();

  switch (env) {
    case 'node':
      // For Node.js, we use LevelDB for persistent storage on disk.
      console.log(`[StorageAdapter] Creating Node.js (LevelDB) blockstore at: ${path}`);
      return new LevelDatastore(path);

    case 'browser':
      // TODO: Implement IndexedDB blockstore for browsers.
      // This would use a library like `datastore-idb`.
      console.log(`[StorageAdapter] Using in-memory blockstore for browser (TODO: Implement IndexedDB).`);
      return new MemoryDatastore();

    default:
      throw new Error('Unsupported environment');
  }
}

/**
 * Creates an index store instance based on the environment.
 * The index store is used for ancillary data, like managing pinned CIDs.
 *
 * @param {string} path - The path or name for the datastore.
 * @returns {import('interface-datastore').Datastore}
 */
export function createIndexstore(path) {
  const env = detectEnvironment();

  switch (env) {
    case 'node':
      // For Node.js, we use LevelDB for persistent storage on disk.
      console.log(`[StorageAdapter] Creating Node.js (LevelDB) index store at: ${path}`);
      return new LevelDatastore(path);

    case 'browser':
      // TODO: Implement IndexedDB index store for browsers.
      // This would use a library like `datastore-idb`.
      console.log(`[StorageAdapter] Using in-memory index store for browser (TODO: Implement IndexedDB).`);
      return new MemoryDatastore();

    default:
      throw new Error('Unsupported environment');
  }
}
