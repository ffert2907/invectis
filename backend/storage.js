import { createIndexstore } from './adapters/storage.js'
import { logger } from './config.js'
import { CID } from 'multiformats/cid'
import { Key } from 'interface-datastore'

/**
 * Manages the persistence of pinned CIDs.
 * It uses its own LevelDB datastore to avoid mixing with Helia's block data.
 */
export class PinManager {
  /**
   * @param {string} datastorePath - The path to the directory where the pin database will be stored.
   */
  constructor(datastorePath) {
    this.datastorePath = datastorePath;
    this.datastore = null; // Will be initialized in open()
  }

  /**
   * Creates and opens the datastore connection. Must be called before any other methods.
   */
  async open() {
    if (this.datastore) {
      return;
    }
    this.datastore = await createIndexstore(this.datastorePath);
    logger.info(`PinManager: Pin database opened at ${this.datastorePath}`);
  }

  /**
   * Closes the datastore connection.
   */
  async close() {
    await this.datastore.close();
    logger.info('PinManager: Pin database closed.');
  }

  /**
   * Pins a CID.
   * @param {CID | string} cid - The CID to pin.
   * @returns {Promise<void>}
   */
  async pin(cid) {
    const cidString = cid.toString();
    const key = new Key(`/pins/${cidString}`);
    try {
      await this.datastore.put(key, new Uint8Array()); // Store an empty value
      logger.info(`PinManager: Pinned CID ${cidString}`);
    } catch (error) {
      logger.error(`PinManager: Error pinning CID ${cidString}:`, error);
      throw error;
    }
  }

  /**
   * Unpins a CID.
   * @param {CID | string} cid - The CID to unpin.
   * @returns {Promise<void>}
   */
  async unpin(cid) {
    const cidString = cid.toString();
    const key = new Key(`/pins/${cidString}`);
    try {
      if (await this.datastore.has(key)) {
        await this.datastore.delete(key);
        logger.info(`PinManager: Unpinned CID ${cidString}`);
      } else {
        logger.warn(`PinManager: Attempted to unpin a non-existent pin: ${cidString}`);
      }
    } catch (error) {
      logger.error(`PinManager: Error unpinning CID ${cidString}:`, error);
      throw error;
    }
  }

  /**
   * Checks if a CID is pinned.
   * @param {CID | string} cid - The CID to check.
   * @returns {Promise<boolean>}
   */
  async isPinned(cid) {
    const cidString = cid.toString();
    const key = new Key(`/pins/${cidString}`);
    return this.datastore.has(key);
  }

  /**
   * Retrieves all pinned CIDs.
   * @returns {Promise<CID[]>} An array of pinned CIDs.
   */
  async getAllPins() {
    const pins = [];
    try {
      for await (const { key } of this.datastore.query({ prefix: '/pins/' })) {
        // Extract the CID string from the key path
        const cidString = key.toString().split('/').pop();
        if (cidString) {
          pins.push(CID.parse(cidString));
        }
      }
    } catch (error) {
      logger.error('PinManager: Error retrieving all pins:', error);
    }
    return pins;
  }
}

/**
 * Handles the garbage collection of unpinned and unreferenced blocks from the datastore.
 */
export class GarbageCollector {
  /**
   * @param {object} options
   * @param {import('helia').Helia['blockstore']} options.blockstore - The Helia blockstore.
   * @param {import('@helia/json').HeliaJSON} options.heliaJson - The Helia JSON instance for reading DAGs.
   * @param {PinManager} options.pinManager - The pin manager to identify root pins.
   */
  constructor({ blockstore, heliaJson, pinManager }) {
    this.blockstore = blockstore;
    this.heliaJson = heliaJson;
    this.pinManager = pinManager;
  }

  /**
   * Finds all unique ancestor CIDs for a given set of starting CIDs.
   * @param {CID[]} startingCids - An array of CIDs to traverse from.
   * @returns {Promise<Set<string>>} A set of all ancestor CID strings.
   */
  async findAllAncestors(startingCids) {
    const ancestors = new Set();
    const queue = [...startingCids];
    const visited = new Set(startingCids.map(c => c.toString()));

    while (queue.length > 0) {
      const cid = queue.shift();
      const cidString = cid.toString();
      ancestors.add(cidString);

      try {
        const node = await this.heliaJson.get(cid);
        if (node && node.parents && Array.isArray(node.parents)) {
          for (const parentCidString of node.parents) {
            if (!visited.has(parentCidString)) {
              visited.add(parentCidString);
              queue.push(CID.parse(parentCidString));
            }
          }
        }
      } catch (err) {
        // This can happen if a block is missing. We'll log it and continue.
        logger.warn(`GC: Could not find block ${cidString} during ancestor traversal. It might be partially synced.`);
      }
    }
    return ancestors;
  }

  /**
   * Runs the garbage collection process.
   * @param {CID[]} dagHeads - The current heads of the main application DAG.
   */
  async run(dagHeads = []) {
    logger.info('GC: Starting garbage collection process...');

    // 1. Find all protected CIDs
    const pinnedCids = await this.pinManager.getAllPins();
    const rootCids = [...dagHeads, ...pinnedCids];
    logger.info(`GC: Found ${dagHeads.length} DAG head(s) and ${pinnedCids.length} pinned item(s).`);
    const protectedCids = await this.findAllAncestors(rootCids);
    logger.info(`GC: Total of ${protectedCids.size} CIDs are protected (roots + ancestors).`);

    // 2. Iterate through all blocks and find candidates for deletion
    const candidatesForDeletion = [];
    let totalBlocks = 0;
    for await (const { cid } of this.blockstore.getAll()) {
      totalBlocks++;
      if (!protectedCids.has(cid.toString())) {
        candidatesForDeletion.push(cid);
      }
    }
    logger.info(`GC: Scanned ${totalBlocks} blocks. Found ${candidatesForDeletion.length} candidate(s) for deletion.`);

    // 3. Delete candidates
    let deletedCount = 0;
    for (const cid of candidatesForDeletion) {
      try {
        await this.blockstore.delete(cid);
        deletedCount++;
      } catch (err) {
        logger.error(`GC: Failed to delete block ${cid.toString()}:`, err);
      }
    }

    logger.info(`GC: Garbage collection finished. Deleted ${deletedCount} block(s).`);
    return deletedCount;
  }
}
