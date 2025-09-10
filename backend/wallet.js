import { readFile, writeFile } from 'fs/promises';
import { logger } from './config.js';
import { generateNullifier } from './identity.js';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';

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
  const peerId = await peerIdFromPrivateKey(privateKey)

  const accountType = walletData.accountType || 'standard'
  const country = walletData.country
  const city = walletData.city
  const nullifier = walletData.nullifier // Changed from nationalIdHash
  logger.info(`✅ Existing wallet loaded (Account Type: ${accountType})`)

  return {
    privateKey,
    peerId,
    accountType,
    country,
    city,
    nullifier
  }
}

/**
 * Initializes or loads a wallet, with interactive creation as a fallback.
 * @param {string} filePath - Path to the wallet file.
 * @param {import('readline').Interface} rl - The readline interface for user input.
 * @returns {Promise<object>} - Wallet data, including the private key.
 */
export async function initializeWallet(filePath, rl) {
  try {
    return await loadWalletFromFile(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('An unexpected error occurred while loading the wallet:', error);
      throw error;
    }

    logger.info('No valid wallet found. Starting interactive creation...');
    const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

    const accountType = await (async () => {
      let choice;
      do {
        choice = await askQuestion('Choose account type (1: Individual, 2: Enterprise): ');
      } while (choice !== '1' && choice !== '2');
      return choice === '1' ? 'individual' : 'enterprise';
    })();

    let walletDetails = { accountType };

    if (accountType === 'individual') {
      logger.info('\nPlease provide your personal information for your individual wallet:');
      const givenName = await askQuestion('  - First Name: ');
      const familyName = await askQuestion('  - Last Name: ');
      const dateOfBirth = await askQuestion('  - Date of Birth (YYYY-MM-DD): ');
      const countryOfBirth = await askQuestion('  - 2-letter Country Code of Birth (e.g., FR): ');
      const cityOfBirth = await askQuestion('  - City of Birth: ');
      walletDetails = { ...walletDetails, givenName, familyName, dateOfBirth, countryOfBirth, cityOfBirth };
    } else {
        logger.info('\nPlease provide details for your enterprise wallet:');
        const country = await askQuestion('  - Country of Operation: ');
        const city = await askQuestion('  - City of Operation: ');
        walletDetails = { ...walletDetails, countryOfBirth: country, cityOfBirth: city };
    }

    return createWallet(filePath, walletDetails);
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
  // Generate a key
  const generatedKey = await libp2pCrypto.keys.generateKeyPair('Ed25519');
  // Marshall it to its protobuf format
  const marshalledKey = libp2pCrypto.keys.privateKeyToProtobuf(generatedKey);
  // Unmarshall it back to a key object. This "round-trip" ensures the key object
  // has the exact same structure as a key loaded from a file.
  const privateKey = await libp2pCrypto.keys.privateKeyFromProtobuf(marshalledKey);
  const peerId = await peerIdFromPrivateKey(privateKey);

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

  // Remove the base64 private key from the wallet data that will be returned
  // to avoid overwriting the privateKey object in the final returned object.
  delete walletData.privateKey;

  return {
    privateKey, // The actual crypto key object
    peerId,
    ...walletData // The rest of the wallet metadata
  };
}
