/**
 * @abstract
 * Base class for a KeyStoreAdapter. Defines the interface for managing wallet keys.
 * Concrete implementations will handle the actual storage mechanism (e.g., filesystem, database).
 */
export class KeyStoreAdapter {
  /**
   * The path or identifier for the keystore.
   * @type {string}
   */
  constructor(path) {
    if (this.constructor === KeyStoreAdapter) {
      throw new Error("Abstract class 'KeyStoreAdapter' cannot be instantiated directly.");
    }
    this.path = path;
  }

  /**
   * Saves wallet data to the keystore.
   * @param {object} walletData - The wallet data to save. Typically includes the private key in a storable format.
   * @returns {Promise<void>}
   * @abstract
   */
  async save(walletData) {
    throw new Error("Method 'save()' must be implemented.");
  }

  /**
   * Loads wallet data from the keystore.
   * @returns {Promise<object>} - The loaded wallet data.
   * @abstract
   */
  async load() {
    throw new Error("Method 'load()' must be implemented.");
  }

  /**
   * Checks if a wallet exists at the specified path.
   * @returns {Promise<boolean>}
   * @abstract
   */
  async exists() {
    throw new Error("Method 'exists()' must be implemented.");
  }
}
