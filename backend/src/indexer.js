import { logger } from '../config.js';

/**
 * The Indexer class is responsible for processing new transactions and
 * updating the search indexes in the provided index store.
 */
export class Indexer {
  /**
   * @param {import('helia').Helia} helia - The Helia instance, used to retrieve block data.
   * @param {import('./src/adapters/index-adapter.js').IndexAdapter} indexStore - The index store to update.
   */
  constructor(helia, indexStore) {
    this.helia = helia;
    this.indexStore = indexStore;
  }

  /**
   * Processes a single transaction CID, retrieves the transaction,
   * and updates the indexes.
   * @param {import('multiformats/cid').CID} cid - The CID of the transaction to process.
   * @returns {Promise<void>}
   */
  async processTransaction(cid) {
    try {
      logger.debug(`Indexer: Processing transaction ${cid.toString()}`);
      // Retrieve the full transaction data from the blockstore
      const transaction = await this.helia.json.get(cid);
      if (transaction) {
        // Pass the transaction to the index store to handle the actual indexing
        await this.indexStore.processTransaction(cid, transaction);
        logger.debug(`Indexer: Successfully indexed ${cid.toString()}`);
      } else {
        logger.warn(`Indexer: Could not find transaction data for CID ${cid.toString()}`);
      }
    } catch (error) {
      logger.error(`Indexer: Error processing transaction ${cid.toString()}:`, error);
    }
  }

  /**
   * Rebuilds the entire index from a set of DAG heads.
   * This is a costly operation and should be used sparingly, e.g., on startup
   * if the index is known to be out of sync.
   * @param {Array<import('multiformats/cid').CID>} dagHeads - The heads of the transaction DAG.
   * @returns {Promise<void>}
   */
  async rebuildFromHeads(dagHeads) {
    logger.info('Indexer: Starting index rebuild from DAG heads...');
    const visited = new Set();
    const queue = [...dagHeads];

    while (queue.length > 0) {
      const cid = queue.shift();
      const cidString = cid.toString();

      if (visited.has(cidString)) {
        continue;
      }
      visited.add(cidString);

      await this.processTransaction(cid);

      try {
        const transaction = await this.helia.json.get(cid);
        if (transaction && transaction.parents && transaction.parents.length > 0) {
          for (const parentCidString of transaction.parents) {
            if (!visited.has(parentCidString)) {
              queue.push(CID.parse(parentCidString));
            }
          }
        }
      } catch (error) {
        logger.error(`Indexer: Error during rebuild, could not process parents of ${cidString}:`, error);
      }
    }
    logger.info('Indexer: Index rebuild complete.');
  }
}
