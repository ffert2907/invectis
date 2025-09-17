/**
 * @abstract
 * Interface for a KeyStoreAdapter.
 * This adapter is responsible for persistently storing and retrieving key-related data,
 * such as wallet private keys or node identity keys.
 */
export class KeyStoreAdapter {
  /**
   * Saves data associated with a given key.
   * @param {string} key - The unique identifier for the data (e.g., 'wallet' or 'node_id').
   * @param {object} data - The JSON-serializable data to store.
   * @returns {Promise<void>}
   */
  async save(key, data) {
    throw new Error("Method 'save()' must be implemented.");
  }

  /**
   * Loads data associated with a given key.
   * @param {string} key - The unique identifier for the data.
   * @returns {Promise<object|null>} - The retrieved data, or null if not found.
   */
  async load(key) {
    throw new Error("Method 'load()' must be implemented.");
  }

  /**
   * Removes data associated with a given key.
   * @param {string} key - The unique identifier for the data.
   * @returns {Promise<void>}
   */
  async remove(key) {
    throw new Error("Method 'remove()' must be implemented.");
  }
}
