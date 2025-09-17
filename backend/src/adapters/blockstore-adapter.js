import { CID } from 'multiformats/cid';

/**
 * @abstract
 * Interface for a BlockstoreAdapter.
 * This adapter is responsible for storing and retrieving IPLD blocks (raw binary data).
 * It must be compatible with the libp2p/Helia Datastore interface.
 * @see https://github.com/ipfs/js-datastore
 */
export class BlockstoreAdapter {
  /**
   * Store the given value under the given key.
   * @param {CID} key - The CID of the block.
   * @param {Uint8Array} val - The raw binary data of the block.
   * @returns {Promise<void>}
   */
  async put(key, val) {
    throw new Error("Method 'put()' must be implemented.");
  }

  /**
   * Retrieve the value for the given key.
   * @param {CID} key - The CID of the block.
   * @returns {Promise<Uint8Array>} - The raw binary data of the block.
   */
  async get(key) {
    throw new Error("Method 'get()' must be implemented.");
  }

  /**
   * Check for the existence of a value for the given key.
   * @param {CID} key - The CID of the block.
   * @returns {Promise<boolean>}
   */
  async has(key) {
    throw new Error("Method 'has()' must be implemented.");
  }

  /**
   * Remove the value for the given key.
   * @param {CID} key - The CID of the block.
   * @returns {Promise<void>}
   */
  async delete(key) {
    throw new Error("Method 'delete()' must be implemented.");
  }

  /**
   * Opens the blockstore, performing any necessary setup.
   * @returns {Promise<void>}
   */
  async open() {
    // This may not be strictly required by the Datastore interface,
    // but it's a good practice for managing underlying resources.
    return;
  }

  /**
   * Closes the blockstore, releasing any resources.
   * @returns {Promise<void>}
   */
  async close() {
    // Companion to open().
    return;
  }
}
