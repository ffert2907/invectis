import { readFile, writeFile } from 'fs/promises';
import { logger } from './config.js';
import { generateNullifier } from './identity.js';

/**
 * Loads a wallet from a file.
 * @param {string} filePath - Path to the wallet file.
 * @returns {Promise<{privateKey: import('@libp2p/interface-keys').PrivateKey, accountType: string, country: string, city: string, nullifier: string}>} - Wallet data.
 */
export async function loadWalletFromFile(filePath) {
  logger.debug('Attempting to load wallet from:', filePath)
  const data = await readFile(filePath, 'utf8')
  const walletData = JSON.parse(data)

  if (walletData.version !== '1.0' || !walletData.privateKey) {
    throw new Error('Invalid or outdated wallet format.')
  }

  const libp2pCrypto = await import('@libp2p/crypto')
  const marshalledPrivKey = new Uint8Array(Buffer.from(walletData.privateKey, 'base64'))
  const privateKey = await libp2pCrypto.keys.privateKeyFromProtobuf(marshalledPrivKey)

  const accountType = walletData.accountType || 'standard'
  const country = walletData.country
  const city = walletData.city
  const nullifier = walletData.nullifier // Changed from nationalIdHash
  logger.info(`✅ Existing wallet loaded (Account Type: ${accountType})`)

  return {
    privateKey,
    accountType,
    country,
    city,
    nullifier
  }
}

/**
 * Initializes or loads a wallet. This function is simplified to only load a wallet,
 * as interactive creation is handled by the frontend and server API.
 * @param {string} filePath - Path to the wallet file.
 * @returns {Promise<object>} - Wallet data.
 */
export async function initializeWallet(filePath) {
  try {
    return await loadWalletFromFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.error(`Wallet file not found at ${filePath}. Please create a wallet via the API.`);
      throw new Error(`Wallet file not found: ${filePath}`);
    }
    logger.error('An unexpected error occurred while loading the wallet:', error);
    throw error;
  }
}

/**
 * Creates a new wallet, generating a nullifier for individual accounts.
 * @param {string} filePath - The path to save the wallet file.
 * @param {object} details - The details for the new wallet.
 * @returns {Promise<object>} - The created wallet data, including the private key.
 */
export async function createWallet(filePath, {
  accountType,
  givenName,
  familyName,
  dateOfBirth,
  countryOfBirth,
  cityOfBirth
}) {
  let nullifier = null;
  if (accountType === 'individual') {
    if (!givenName || !familyName || !dateOfBirth || !countryOfBirth || !cityOfBirth) {
      throw new Error('Missing personal information for individual wallet creation.');
    }
    nullifier = generateNullifier({
      givenName,
      familyName,
      dateOfBirth,
      countryOfBirth,
      cityOfBirth
    });
    logger.info('✅ Nullifier generated for individual account.');
  }

  const libp2pCrypto = await import('@libp2p/crypto');
  const privateKey = await libp2pCrypto.keys.generateKeyPair('Ed25519');
  const marshalledKey = libp2pCrypto.keys.privateKeyToProtobuf(privateKey);

  const walletData = {
    version: '1.0',
    type: 'Ed25519',
    accountType,
    country: countryOfBirth, // Using countryOfBirth for wallet metadata
    city: cityOfBirth,       // Using cityOfBirth for wallet metadata
    nullifier, // Storing the nullifier, which can be null for non-individual types
    privateKey: Buffer.from(marshalledKey).toString('base64'),
    created: new Date().toISOString()
  };

  await writeFile(filePath, JSON.stringify(walletData, null, 2), 'utf8');
  logger.info(`✅ New wallet created and saved (Account Type: ${accountType})`);

  return {
    privateKey,
    ...walletData
  };
}
