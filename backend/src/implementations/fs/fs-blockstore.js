import { BlockstoreAdapter } from '../../adapters/blockstore-adapter.js';
import { LevelDatastore } from 'datastore-level';
import { Key } from 'interface-datastore';

/**
 * A blockstore implementation that uses LevelDB for persistent storage on the file system.
 * It is compatible with the Helia/libp2p Datastore interface.
 */
export class FsBlockstore extends BlockstoreAdapter {
  /**
   * @param {string} location - The file system path where the LevelDB data will be stored.
   */
  constructor(location) {
    super();
    this.location = location;
    this.datastore = new LevelDatastore(this.location);
  }

  /**
   * Converts a CID into a Key object for the datastore.
   * @param {import('multiformats/cid').CID} cid
   * @returns {Key}
   * @private
   */
  _cidToKey(cid) {
    // The key in a blockstore is the hash digest of the block.
    // We use the full CID string representation as the key path for simplicity
    // and to ensure uniqueness.
    return new Key(cid.toString());
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
   * Stores a block in the datastore.
   * @param {import('multiformats/cid').CID} key - The CID of the block.
   * @param {Uint8Array} val - The raw binary data of the block.
   * @returns {Promise<void>}
   */
  async put(key, val) {
    await this.datastore.put(this._cidToKey(key), val);
  }

  /**
   * Retrieves a block from the datastore.
   * @param {import('multiformats/cid').CID} key - The CID of the block.
   * @returns {Promise<Uint8Array>}
   */
  async get(key) {
    return this.datastore.get(this._cidToKey(key));
  }

  /**
   * Checks if a block exists in the datastore.
   * @param {import('multiformats/cid').CID} key - The CID of the block.
   * @returns {Promise<boolean>}
   */
  async has(key) {
    return this.datastore.has(this._cidToKey(key));
  }

  /**
   * Deletes a block from the datastore.
   * @param {import('multiformats/cid').CID} key - The CID of the block.
   * @returns {Promise<void>}
   */
  async delete(key) {
    await this.datastore.delete(this._cidToKey(key));
  }
}
