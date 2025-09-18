import path from 'path';
import { createKeystore } from './adapters/keystore.js';
import { logger } from './config.js';
import { generateNullifier } from './identity.js';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { randomUUID } from 'crypto';
import { TextEncoder } from 'util';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { randomBytes as randomBytesNoble } from '@noble/hashes/utils';

export async function loadWalletFromFile(filePath, options = {}) {
  const { quiet = false } = options;
  if (!quiet) logger.debug(`Attempting to load wallet from Keystore: ${filePath}`);

  const keystore = createKeystore(path.dirname(filePath));
  const decryptedData = await keystore.loadKey(path.basename(filePath));

  if (!decryptedData) {
      const error = new Error(`Wallet not found at path: ${filePath}`);
      error.code = 'ENOENT';
      throw error;
  }
  const walletData = JSON.parse(decryptedData.toString('utf8'));

  if (walletData.version !== '1.0' || !walletData.privateKey) {
    throw new Error('Invalid or outdated wallet format.');
  }

  const libp2pCrypto = await import('@libp2p/crypto');
  const marshalledPrivKey = new Uint8Array(Buffer.from(walletData.privateKey, 'base64'));
  const privateKey = await libp2pCrypto.keys.privateKeyFromProtobuf(marshalledPrivKey);
  const peerId = await peerIdFromPrivateKey(privateKey);

  let encryptionPrivateKey = walletData.encryptionPrivateKey ? Buffer.from(walletData.encryptionPrivateKey, 'base64') : null;
  let encryptionPublicKey = walletData.encryptionPublicKey ? Buffer.from(walletData.encryptionPublicKey, 'base64') : null;

  if (!encryptionPrivateKey || !encryptionPublicKey) {
    logger.info(`Wallet at ${filePath} is an older version. Upgrading with new encryption keys...`);
    encryptionPrivateKey = randomBytesNoble(32);
    encryptionPublicKey = secp256k1.getPublicKey(encryptionPrivateKey);
    walletData.encryptionPrivateKey = Buffer.from(encryptionPrivateKey).toString('base64');
    walletData.encryptionPublicKey = Buffer.from(encryptionPublicKey).toString('base64');
    const dataToStore = Buffer.from(JSON.stringify(walletData, null, 2));
    await keystore.saveKey(path.basename(filePath), dataToStore);
    logger.info(`✅ Wallet upgraded and re-saved to Keystore: ${filePath}`);
  }

  if (!quiet) logger.info(`✅ Existing wallet loaded (Account Type: ${walletData.accountType})`);

  return {
    privateKey, peerId,
    accountType: walletData.accountType,
    country: walletData.country, city: walletData.city,
    nullifier: walletData.nullifier,
    encryptionPrivateKey, encryptionPublicKey
  };
}

export async function initializeWallet(filePath, rl) {
  try {
    return await loadWalletFromFile(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('An unexpected error occurred while loading the wallet:', error);
      throw error;
    }

    logger.info('No valid wallet found. Starting interactive creation...');
    if (!rl) throw new Error('Readline interface is required for interactive wallet creation.');

    const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));
    const accountType = await askQuestion('Choose account type (1: Individual, 2: Enterprise): ') === '1' ? 'individual' : 'enterprise';
    let walletDetails = { accountType };

    if (accountType === 'individual') {
      logger.info('\nPlease provide your personal information:');
      walletDetails.givenName = await askQuestion('  - First Name: ');
      walletDetails.familyName = await askQuestion('  - Last Name: ');
      walletDetails.dateOfBirth = await askQuestion('  - Date of Birth (YYYY-MM-DD): ');
      walletDetails.countryOfBirth = await askQuestion('  - 2-letter Country Code of Birth (e.g., FR): ');
      walletDetails.cityOfBirth = await askQuestion('  - City of Birth: ');
    } else {
        logger.info('\nPlease provide details for your enterprise wallet:');
        walletDetails.countryOfBirth = await askQuestion('  - Country of Operation: ');
        walletDetails.cityOfBirth = await askQuestion('  - City of Operation: ');
    }
    return createWallet(filePath, walletDetails);
  }
}

export async function createWallet(filePath, details) {
  let nullifier = null;
  if (details.accountType === 'individual') {
    if (!details.givenName || !details.familyName || !details.dateOfBirth || !details.countryOfBirth || !details.cityOfBirth) {
      throw new Error('Missing personal information for individual wallet creation.');
    }
    nullifier = generateNullifier(details);
    logger.info('✅ Nullifier generated for individual account.');
  }

  const libp2pCrypto = await import('@libp2p/crypto');
  const generatedKey = await libp2pCrypto.keys.generateKeyPair('Ed25519');
  const marshalledKey = libp2pCrypto.keys.privateKeyToProtobuf(generatedKey);
  const privateKey = await libp2pCrypto.keys.privateKeyFromProtobuf(marshalledKey);
  const peerId = await peerIdFromPrivateKey(privateKey);
  const encryptionPrivateKey = randomBytesNoble(32);
  const encryptionPublicKey = secp256k1.getPublicKey(encryptionPrivateKey);

  const walletData = {
    version: '1.0', type: 'Ed25519',
    accountType: details.accountType, country: details.countryOfBirth, city: details.cityOfBirth,
    nullifier,
    privateKey: Buffer.from(marshalledKey).toString('base64'),
    encryptionPrivateKey: Buffer.from(encryptionPrivateKey).toString('base64'),
    encryptionPublicKey: Buffer.from(encryptionPublicKey).toString('base64'),
    created: new Date().toISOString()
  };

  if (filePath) {
    const keystore = createKeystore(path.dirname(filePath));
    const dataToStore = Buffer.from(JSON.stringify(walletData, null, 2));
    await keystore.saveKey(path.basename(filePath), dataToStore);
    logger.info(`✅ New wallet created and saved via KeyStore to ${filePath}`);
  }

  delete walletData.privateKey;
  delete walletData.encryptionPrivateKey;

  return { privateKey, encryptionPrivateKey, encryptionPublicKey, peerId, ...walletData };
}

function canonicalize(object) {
    const sortedObject = {};
    Object.keys(object).sort().forEach(key => { sortedObject[key] = object[key]; });
    return JSON.stringify(sortedObject);
}

export async function signAttestation(wallet, nodePeerId, ttlSeconds = 600) {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
    const attestation = {
        type: 'wallet-node-attestation', version: '1',
        walletPeerId: wallet.peerId.toString(),
        walletPubKey: Buffer.from(wallet.privateKey.publicKey.raw).toString('base64'),
        walletEncryptionPubKey: Buffer.from(wallet.encryptionPublicKey).toString('base64'),
        nodePeerId: nodePeerId.toString(),
        issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(),
        nonce: randomUUID(), capabilities: ['relay', 'indexing']
    };
    const payloadToSign = canonicalize(attestation);
    const signatureBytes = await wallet.privateKey.sign(new TextEncoder().encode(payloadToSign));
    const signature = Buffer.from(signatureBytes).toString('base64');
    logger.info(`✅ Attestation signed for Node ${nodePeerId.toString()}`);
    return { attestation, signature };
}
