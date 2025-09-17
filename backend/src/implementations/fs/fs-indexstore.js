import { IndexAdapter } from '../../adapters/index-adapter.js';
import { LevelDatastore } from 'datastore-level';
import { Key } from 'interface-datastore';

const PINS_KEY = new Key('pins');
const WALLET_TX_PREFIX = 'wallet-txs';

/**
 * An index store implementation that uses LevelDB for persistent storage.
 * It maintains indexes to allow for efficient querying of the ledger.
 */
export class FsIndexstore extends IndexAdapter {
  /**
   * @param {string} location - The file system path where the LevelDB data will be stored.
   */
  constructor(location) {
    super();
    this.datastore = new LevelDatastore(location);
  }

  /**
   * Opens the underlying LevelDB datastore.
   * @returns {Promise<void>}
   */
  async open() {
    await this.datastore.open();
  }

  /**
   * Closes the underlying LevelDB datastore.
   * @returns {Promise<void>}
   */
  async close() {
    await this.datastore.close();
  }

  /**
   * Processes a transaction and updates the relevant indexes.
   * @param {import('multiformats/cid').CID} cid - The CID of the transaction.
   * @param {object} transaction - The transaction data.
   * @returns {Promise<void>}
   */
  async processTransaction(cid, transaction) {
    const involvedPeers = new Set();
    if (transaction.author) {
      involvedPeers.add(transaction.author);
    }
    if (transaction.payload && transaction.payload.to) {
      involvedPeers.add(transaction.payload.to);
    }

    for (const peerId of involvedPeers) {
      const key = new Key(`${WALLET_TX_PREFIX}/${peerId}`);
      let txList = [];
      try {
        const rawList = await this.datastore.get(key);
        txList = JSON.parse(new TextDecoder().decode(rawList));
      } catch (error) {
        if (error.code !== 'ERR_NOT_FOUND') throw error;
      }

      if (!txList.includes(cid.toString())) {
        txList.push(cid.toString());
        await this.datastore.put(key, new TextEncoder().encode(JSON.stringify(txList)));
      }
    }
  }

  /**
   * Retrieves a list of transaction CIDs for a given wallet peerId.
   * @param {string} peerId - The peerId of the wallet.
   * @returns {Promise<string[]>} - An array of transaction CIDs as strings.
   */
  async getTransactionsForWallet(peerId) {
    const key = new Key(`${WALLET_TX_PREFIX}/${peerId}`);
    try {
      const rawList = await this.datastore.get(key);
      return JSON.parse(new TextDecoder().decode(rawList));
    } catch (error) {
      if (error.code === 'ERR_NOT_FOUND') {
        return []; // No transactions found for this wallet
      }
      throw error;
    }
  }

  /**
   * Gets the current list of pinned CIDs.
   * @returns {Promise<string[]>} - An array of pinned CIDs as strings.
   */
  async getPinnedCIDs() {
    try {
      const rawPins = await this.datastore.get(PINS_KEY);
      return JSON.parse(new TextDecoder().decode(rawPins));
    } catch (error) {
      if (error.code === 'ERR_NOT_FOUND') {
        return []; // No pins found
      }
      throw error;
    }
  }

  /**
   * Adds a CID to the pinned list.
   * @param {import('multiformats/cid').CID} cid - The CID to pin.
   * @returns {Promise<void>}
   */
  async pin(cid) {
    const pins = await this.getPinnedCIDs();
    const cidString = cid.toString();
    if (!pins.includes(cidString)) {
      pins.push(cidString);
      await this.datastore.put(PINS_KEY, new TextEncoder().encode(JSON.stringify(pins)));
    }
  }

  /**
   * Removes a CID from the pinned list.
   * @param {import('multiformats/cid').CID} cid - The CID to unpin.
   * @returns {Promise<void>}
   */
  async unpin(cid) {
    let pins = await this.getPinnedCIDs();
    const cidString = cid.toString();
    if (pins.includes(cidString)) {
      pins = pins.filter(p => p !== cidString);
      await this.datastore.put(PINS_KEY, new TextEncoder().encode(JSON.stringify(pins)));
    }
  }
}
