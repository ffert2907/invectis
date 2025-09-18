import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';

// Promisify the scrypt function
const scryptAsync = promisify(scrypt);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// In a real app, this should come from a secure, user-provided source or a config file.
const ENCRYPTION_PASSWORD = process.env.KEYSTORE_PASSWORD || 'default-dev-password';

/**
 * Detects the current environment.
 * @returns {'node' | 'browser'}
 */
function detectEnvironment() {
  if (typeof window === 'undefined') {
    return 'node';
  }
  return 'browser';
}

class NodeKeyStore {
  constructor(keystorePath) {
    this.keystorePath = keystorePath;
  }

  async #encrypt(data) {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = await scryptAsync(ENCRYPTION_PASSWORD, salt, KEY_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([salt, iv, tag, encrypted]).toString('hex');
  }

  async #decrypt(encryptedData) {
    const data = Buffer.from(encryptedData, 'hex');
    const salt = data.slice(0, SALT_LENGTH);
    const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = data.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = await scryptAsync(ENCRYPTION_PASSWORD, salt, KEY_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  async saveKey(keyName, keyData) {
    await fs.mkdir(this.keystorePath, { recursive: true });
    const filePath = path.join(this.keystorePath, `${keyName}.key`);
    const encryptedKey = await this.#encrypt(keyData);
    await fs.writeFile(filePath, encryptedKey, 'utf8');
    console.log(`[KeyStoreAdapter] Securely saved key '${keyName}' to file.`);
  }

  async loadKey(keyName) {
    try {
      const filePath = path.join(this.keystorePath, `${keyName}.key`);
      const encryptedKey = await fs.readFile(filePath, 'utf8');
      console.log(`[KeyStoreAdapter] Loading key '${keyName}' from file.`);
      return await this.#decrypt(encryptedKey);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`[KeyStoreAdapter] Key '${keyName}' not found.`);
        return null; // Key not found is not an error
      }
      throw error; // Other errors should be thrown
    }
  }
}

// TODO: Implement a browser-based keystore using IndexedDB and crypto.subtle
class BrowserKeyStore {
    constructor(dbName) {
        console.log(`[KeyStoreAdapter] Browser keystore initialized (not implemented). DB Name: ${dbName}`);
    }

    async saveKey(keyName, keyData) {
        console.warn(`[KeyStoreAdapter] 'saveKey' not implemented for browser.`);
        return Promise.resolve();
    }

    async loadKey(keyName) {
        console.warn(`[KeyStoreAdapter] 'loadKey' not implemented for browser.`);
        return Promise.resolve(null);
    }
}


/**
 * Creates a keystore instance based on the environment.
 *
 * @param {string} storePathOrName - The path for the keystore on Node.js or a DB name for browsers.
 * @returns {NodeKeyStore | BrowserKeyStore}
 */
export function createKeystore(storePathOrName) {
  const env = detectEnvironment();

  switch (env) {
    case 'node':
      return new NodeKeyStore(storePathOrName);
    case 'browser':
       return new BrowserKeyStore(storePathOrName);
    default:
      throw new Error('Unsupported environment for Keystore');
  }
}
