import { KeyStoreAdapter } from '../../adapters/keystore-adapter.js';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * A file-system-based implementation of the KeyStoreAdapter.
 * It stores each key as a separate JSON file in a specified directory.
 */
export class FsKeyStore extends KeyStoreAdapter {
  /**
   * @param {string} directory - The directory where the key files will be stored.
   */
  constructor(directory) {
    super();
    this.directory = directory;
  }

  /**
   * Ensures the storage directory exists.
   * @private
   */
  async _ensureDir() {
    await fs.mkdir(this.directory, { recursive: true });
  }

  /**
   * Saves data associated with a given key to a JSON file.
   * @param {string} key - The unique identifier for the data (used as the filename, with a .json extension).
   * @param {object} data - The JSON-serializable data to store.
   * @returns {Promise<void>}
   */
  async save(key, data) {
    await this._ensureDir();
    const filePath = path.join(this.directory, `${key}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Loads data associated with a given key from a JSON file.
   * @param {string} key - The unique identifier for the data.
   * @returns {Promise<object|null>} - The retrieved data, or null if the file does not exist.
   */
  async load(key) {
    const filePath = path.join(this.directory, `${key}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File not found, which is a normal case
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * Removes the file associated with a given key.
   * @param {string} key - The unique identifier for the data.
   * @returns {Promise<void>}
   */
  async remove(key) {
    const filePath = path.join(this.directory, `${key}.json`);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error; // Don't throw an error if the file doesn't exist
      }
    }
  }
}
