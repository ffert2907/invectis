import { CID } from 'multiformats/cid';
import { logger } from './config.js';

/**
 * Manages the lifecycle of the ledger, including adding transactions,
 * updating heads, and ensuring data is indexed.
 */
export class LedgerManager {
  /**
   * @param {import('helia').Helia} helia - The Helia instance for block storage.
   * @param {import('@helia/json').HeliaJSON} heliaJson - The Helia JSON interface.
   * @param {import('./adapters/index-adapter.js').IndexAdapter} indexer - The indexer for querying transactions.
   */
  constructor(helia, heliaJson, indexer) {
    this.helia = helia;
    this.heliaJson = heliaJson;
    this.indexer = indexer;
    /**
     * The current heads of the transaction DAG.
     * @type {Set<CID>}
     */
    this.heads = new Set();
  }

  /**
   * Adds a new transaction to the ledger.
   * 1. Puts the transaction object into the blockstore (Helia).
   * 2. Indexes the transaction using the indexer.
   * 3. Updates the DAG heads.
   * @param {object} tx - The transaction object to add.
   * @returns {Promise<CID>} The CID of the newly added transaction.
   */
  async addTransaction(tx) {
    // 1. Add to Helia Blockstore
    const cid = await this.heliaJson.add(tx);
    logger.info(`LedgerManager: Added transaction to Helia with CID: ${cid.toString()}`);

    // 2. Index the transaction
    await this.indexer.indexTransaction(tx, cid);
    logger.info(`LedgerManager: Indexed transaction ${cid.toString()}`);

    // 3. Update DAG heads
    // The new transaction becomes a new head.
    // Its parents are no longer heads.
    this.heads.add(cid);
    if (tx.parents && tx.parents.length > 0) {
      for (const parentCidString of tx.parents) {
        const parentCid = CID.parse(parentCidString);
        if (this.heads.has(parentCid)) {
          this.heads.delete(parentCid);
        }
      }
    }
    logger.info(`LedgerManager: Updated heads. New head count: ${this.heads.size}`);

    return cid;
  }

  /**
   * Returns the current heads of the ledger DAG.
   * @returns {CID[]} An array of the current head CIDs.
   */
  getHeads() {
    return Array.from(this.heads);
  }

  /**
   * A helper to get all transactions for a wallet using the indexer.
   * This shows how the indexer will be used for reads.
   * @param {string} peerId - The peer ID of the wallet.
   * @returns {Promise<object[]>} A list of transaction objects.
   */
  async getTransactionsForWallet(peerId) {
    const cids = await this.indexer.getTransactionsForWallet(peerId);
    const transactions = [];
    for (const cidString of cids) {
      try {
        const cid = CID.parse(cidString);
        const tx = await this.heliaJson.get(cid);
        if (tx) {
          transactions.push({ id: cidString, ...tx });
        }
      } catch (error) {
        logger.error(`LedgerManager: Failed to retrieve or parse transaction ${cidString}`, error);
      }
    }
    // Sort by timestamp descending
    return transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
}
