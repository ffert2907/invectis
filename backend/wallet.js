import { logger } from './config.js';
import { generateNullifier } from './identity.js';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { randomUUID } from 'crypto';
import { TextEncoder } from 'util';

/**
 * Loads a wallet using a KeyStoreAdapter.
 * @param {import('./src/adapters/keystore-adapter.js').KeyStoreAdapter} keyStore - The keystore to use.
 * @param {string} key - The key for the wallet data.
 * @param {object} [options] - Optional settings.
 * @param {boolean} [options.quiet=false] - If true, suppress verbose logs.
 * @returns {Promise<{privateKey: import('@libp2p/interface-keys').PrivateKey, accountType: string, country: string, city: string, nullifier: string}|null>} - Wallet data or null if not found.
 */
export async function loadWallet(keyStore, key, options = {}) {
  const { quiet = false } = options;

  if (!quiet) {
    logger.debug('Attempting to load wallet for key:', key);
  }

  const walletData = await keyStore.load(key);

  if (!walletData) {
    return null;
  }

  if (walletData.version !== '1.0' || !walletData.privateKey) {
    throw new Error('Invalid or outdated wallet format.');
  }

  const libp2pCrypto = await import('@libp2p/crypto');
  const marshalledPrivKey = new Uint8Array(Buffer.from(walletData.privateKey, 'base64'));
  const privateKey = await libp2pCrypto.keys.privateKeyFromProtobuf(marshalledPrivKey);
  const peerId = await peerIdFromPrivateKey(privateKey);

  const accountType = walletData.accountType || 'standard';
  const country = walletData.country;
  const city = walletData.city;
  const nullifier = walletData.nullifier; // Changed from nationalIdHash

  if (!quiet) {
    logger.info(`✅ Existing wallet loaded (Account Type: ${accountType})`);
  }

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
 * @param {import('./src/adapters/keystore-adapter.js').KeyStoreAdapter} keyStore - The keystore to use for loading/saving.
 * @param {string} key - The key to use for the wallet.
 * @param {import('readline').Interface} rl - The readline interface for user input.
 * @returns {Promise<object>} - Wallet data, including the private key.
 */
export async function initializeWallet(keyStore, key, rl) {
  const existingWallet = await loadWallet(keyStore, key);
  if (existingWallet) {
    return existingWallet;
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

  return createWallet(keyStore, key, walletDetails);
}

/**
 * Creates a new wallet, generating a nullifier for individual accounts.
 * @param {import('./src/adapters/keystore-adapter.js').KeyStoreAdapter} keyStore - The keystore to save the wallet to.
 * @param {string} key - The key to save the wallet under.
 * @param {object} details - The details for the new wallet.
 * @returns {Promise<object>} - The created wallet data, including the private key.
 */
export async function createWallet(keyStore, key, {
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
    country: countryOfBirth,
    city: cityOfBirth,
    nullifier,
    // The base64 version is for saving to disk only.
    privateKey: Buffer.from(marshalledKey).toString('base64'),
    created: new Date().toISOString()
  };

  if (keyStore) {
    await keyStore.save(key, walletData);
    logger.info(`✅ New wallet created and saved for key: ${key} (Account Type: ${accountType})`);
  }

  // Remove the base64 private key from the data we will merge into the final object.
  delete walletData.privateKey;

  // Return the live, canonical private key object along with the rest of the metadata.
  return {
    privateKey, // The actual crypto key object
    peerId,
    ...walletData // The rest of the wallet metadata
  };
}

/**
 * Creates a canonical string representation of a JSON object.
 * Keys are sorted alphabetically to ensure a consistent output.
 * @param {object} object - The object to canonicalize.
 * @returns {string} - A deterministic string representation of the object.
 */
function canonicalize(object) {
    const sortedObject = {};
    Object.keys(object).sort().forEach(key => {
        sortedObject[key] = object[key];
    });
    return JSON.stringify(sortedObject);
}


/**
 * Creates and signs an attestation that binds a wallet's identity to a node's PeerID.
 * This allows a node to prove it has permission to act on behalf of a wallet for a limited time.
 *
 * @param {import('@libp2p/interface-keys').PrivateKey} walletPrivateKey - The wallet's private key object.
 * @param {import('@libp2p/interface-peer-id').PeerId} walletPeerId - The wallet's full PeerId object.
 * @param {import('@libp2p/interface-peer-id').PeerId} nodePeerId - The PeerID of the node that will use this attestation.
 * @param {number} [ttlSeconds=600] - The time-to-live for the attestation in seconds. Defaults to 10 minutes.
 * @returns {Promise<{attestation: object, signature: string}>} The attestation object and its base64-encoded signature.
 */
export async function signAttestation(walletPrivateKey, walletPeerId, nodePeerId, ttlSeconds = 600) {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    const attestation = {
        type: 'wallet-node-attestation',
        version: '1',
        walletPeerId: walletPeerId.toString(),
        walletPubKey: Buffer.from(walletPrivateKey.publicKey.raw).toString('base64'),
        nodePeerId: nodePeerId.toString(),
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        nonce: randomUUID(),
        capabilities: ['relay', 'indexing'] // Example capabilities from design
    };

    const payloadToSign = canonicalize(attestation);
    const signatureBytes = await walletPrivateKey.sign(new TextEncoder().encode(payloadToSign));
    const signature = Buffer.from(signatureBytes).toString('base64');

    logger.info(`✅ Attestation signed for Node ${nodePeerId.toString()}`);

    return {
        attestation,
        signature
    };
}
