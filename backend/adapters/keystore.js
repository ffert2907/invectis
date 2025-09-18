import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ENCRYPTION_PASSWORD = process.env.KEYSTORE_PASSWORD || 'default-dev-password';

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
    const filePath = path.join(this.keystorePath, keyName);
    const encryptedKey = await this.#encrypt(keyData);
    await fs.writeFile(filePath, encryptedKey, 'utf8');
  }

  async loadKey(keyName) {
    try {
      const filePath = path.join(this.keystorePath, keyName);
      const encryptedKey = await fs.readFile(filePath, 'utf8');
      return await this.#decrypt(encryptedKey);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
}

export function createKeystore(storePathOrName) {
  // For now, we only support Node.js Keystore
  return new NodeKeyStore(storePathOrName);
}
