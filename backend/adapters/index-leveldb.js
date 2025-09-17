import { IndexAdapter } from './index-adapter.js';
import { fromString as uint8ArrayFromString, toString as uint8ArrayToString } from 'uint8arrays';
import { Key } from 'interface-datastore';

/**
 * An IndexAdapter that uses a LevelDB-compatible datastore to create and manage secondary indexes.
 */
export class LevelDBIndexAdapter extends IndexAdapter {
  /**
   * Creates a key for storing a wallet's transaction index.
   * @param {string} peerId - The peer ID of the wallet.
   * @returns {import('interface-datastore').Key}
   */
  _getWalletIndexKey(peerId) {
    return new Key(`/idx/wtx/${peerId}`);
  }

  /**
   * Indexes a transaction by adding its CID to the transaction lists of all involved wallets.
   * @param {object} transaction - The transaction object.
   * @param {import('multiformats').CID} cid - The CID of the transaction.
   */
  async indexTransaction(transaction, cid) {
    const cidString = cid.toString();
    const involvedWallets = new Set();

    // Add the author
    if (transaction.author) {
      involvedWallets.add(transaction.author);
    }
    // Add the recipient
    if (transaction.payload && transaction.payload.to) {
      involvedWallets.add(transaction.payload.to);
    }

    for (const peerId of involvedWallets) {
      await this._addCidToWalletIndex(peerId, cidString);
    }
  }

  /**
   * A helper to add a CID to a specific wallet's index. This is a read-modify-write operation.
   * @param {string} peerId - The wallet's peer ID.
   * @param {string} cidString - The CID string to add.
   * @private
   */
  async _addCidToWalletIndex(peerId, cidString) {
    const key = this._getWalletIndexKey(peerId);
    let cids = [];
    try {
      const existingData = await this.datastore.get(key);
      cids = JSON.parse(uint8ArrayToString(existingData));
    } catch (error) {
      if (error.code !== 'ERR_NOT_FOUND') {
        throw error;
      }
      // If not found, we start with an empty array.
    }

    if (!cids.includes(cidString)) {
      cids.push(cidString);
      const data = uint8ArrayFromString(JSON.stringify(cids));
      await this.datastore.put(key, data);
    }
  }

  /**
   * Retrieves the list of transaction CIDs for a given wallet.
   * @param {string} peerId - The peer ID of the wallet.
   * @returns {Promise<string[]>} - An array of transaction CID strings.
   */
  async getTransactionsForWallet(peerId) {
    const key = this._getWalletIndexKey(peerId);
    try {
      const data = await this.datastore.get(key);
      return JSON.parse(uint8ArrayToString(data));
    } catch (error) {
      if (error.code === 'ERR_NOT_FOUND') {
        return []; // Return empty array if no index exists for this wallet.
      }
      throw error;
    }
  }
}
