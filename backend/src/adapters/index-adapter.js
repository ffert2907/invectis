/**
 * @abstract
 * Interface for an IndexAdapter.
 * This adapter is responsible for creating and maintaining indexes over the
 * ledger data to allow for efficient queries, avoiding full DAG traversals.
 */
export class IndexAdapter {
  /**
   * Processes a transaction and updates the relevant indexes.
   * This method should be called whenever a new block/transaction is added to the store.
   * @param {import('multiformats/cid').CID} cid - The CID of the transaction.
   * @param {object} transaction - The transaction data.
   * @returns {Promise<void>}
   */
  async processTransaction(cid, transaction) {
    throw new Error("Method 'processTransaction()' must be implemented.");
  }

  /**
   * Retrieves a list of transaction CIDs for a given wallet peerId.
   * @param {string} peerId - The peerId of the wallet.
   * @returns {Promise<string[]>} - An array of transaction CIDs as strings.
   */
  async getTransactionsForWallet(peerId) {
    throw new Error("Method 'getTransactionsForWallet()' must be implemented.");
  }

  /**
   * Gets the current list of pinned CIDs.
   * @returns {Promise<string[]>} - An array of pinned CIDs as strings.
   */
  async getPinnedCIDs() {
    throw new Error("Method 'getPinnedCIDs()' must be implemented.");
  }

  /**
   * Adds a CID to the pinned list.
   * @param {import('multiformats/cid').CID} cid - The CID to pin.
   * @returns {Promise<void>}
   */
  async pin(cid) {
    throw new Error("Method 'pin()' must be implemented.");
  }

  /**
   * Removes a CID from the pinned list.
   * @param {import('multiformats/cid').CID} cid - The CID to unpin.
   * @returns {Promise<void>}
   */
  async unpin(cid) {
    throw new Error("Method 'unpin()' must be implemented.");
  }

  /**
   * Opens the index, performing any necessary setup.
   * @returns {Promise<void>}
   */
  async open() {
    return;
  }

  /**
   * Closes the index, releasing any resources.
   * @returns {Promise<void>}
   */
  async close() {
    return;
  }
}
