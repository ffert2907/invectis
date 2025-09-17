/**
 * @abstract
 * Base class for an IndexAdapter. Defines the interface for indexing and querying transactions.
 * This helps decouple the ledger logic from the specific indexing mechanism.
 */
export class IndexAdapter {
  /**
   * @param {import('datastore-core').Datastore} datastore - The datastore to use for storing indexes.
   */
  constructor(datastore) {
    if (this.constructor === IndexAdapter) {
      throw new Error("Abstract class 'IndexAdapter' cannot be instantiated directly.");
    }
    this.datastore = datastore;
  }

  /**
   * Indexes a transaction. This typically involves creating secondary indexes,
   * for example, to look up transactions by wallet.
   * @param {object} transaction - The transaction object to index.
   * @param {import('multiformats').CID} cid - The CID of the transaction.
   * @returns {Promise<void>}
   * @abstract
   */
  async indexTransaction(transaction, cid) {
    throw new Error("Method 'indexTransaction()' must be implemented.");
  }

  /**
   * Retrieves an array of transaction CIDs for a given wallet peer ID.
   * @param {string} peerId - The peer ID of the wallet.
   * @returns {Promise<string[]>} - An array of transaction CID strings.
   * @abstract
   */
  async getTransactionsForWallet(peerId) {
    throw new Error("Method 'getTransactionsForWallet()' must be implemented.");
  }
}
