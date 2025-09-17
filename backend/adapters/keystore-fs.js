import { readFile, writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import { KeyStoreAdapter } from './keystore-adapter.js';

/**
 * A KeyStoreAdapter that stores wallet data in a JSON file on the local filesystem.
 */
export class FileSystemKeyStoreAdapter extends KeyStoreAdapter {
  /**
   * Saves the wallet data to a JSON file.
   * @param {object} walletData - The wallet data object to be serialized and saved.
   * @returns {Promise<void>}
   */
  async save(walletData) {
    await writeFile(this.path, JSON.stringify(walletData, null, 2), 'utf8');
  }

  /**
   * Loads the wallet data from a JSON file.
   * @returns {Promise<object>} - The parsed wallet data object.
   */
  async load() {
    const data = await readFile(this.path, 'utf8');
    return JSON.parse(data);
  }

  /**
   * Checks if the wallet file exists and is accessible.
   * @returns {Promise<boolean>} - True if the file exists, false otherwise.
   */
  async exists() {
    try {
      await access(this.path, constants.F_OK);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      // For other errors (like permissions), re-throw them.
      throw error;
    }
  }
}
