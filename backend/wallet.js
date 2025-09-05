import { readFile, writeFile } from 'fs/promises';
import { logger } from './config.js';
import { createHash } from 'crypto';

/**
 * Initializes or loads a cryptographic wallet.
 * This function handles creating a new private key or loading an existing one.
 * @param {string} filePath - Path to the wallet file.
 * @param {import('readline').Interface | null} rl - The readline interface for user input, or null for non-interactive mode.
 * @param {boolean} nonInteractive - If true, will not prompt for input and can auto-create a basic wallet.
 * @returns {Promise<{privateKey: import('@libp2p/interface-keys').PrivateKey, accountType?: string, country?: string, city?: string, nationalIdHash?: string}>} - An object containing the libp2p private key and wallet metadata.
 */
export async function initializeWallet(filePath, rl, nonInteractive = false) {
  let privateKey;
  let accountType, country, city, nationalIdHash;

  try {
    logger.debug('Attempting to load wallet from:', filePath);
    const data = await readFile(filePath, 'utf8');
    const walletData = JSON.parse(data);

    if (walletData.version !== '1.0' || !walletData.privateKey) {
      throw new Error('Invalid or outdated wallet format.');
    }

    const libp2pCrypto = await import('@libp2p/crypto');
    // Using a different variable name to avoid shadowing
    const marshalledPrivKey = new Uint8Array(Buffer.from(walletData.privateKey, 'base64'));
    privateKey = await libp2pCrypto.keys.unmarshalPrivateKey(marshalledPrivKey);
    
    accountType = walletData.accountType;
    country = walletData.country;
    city = walletData.city;
    nationalIdHash = walletData.nationalIdHash;
    logger.info(`✅ Existing wallet loaded from ${filePath}`);

  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error(`Error reading wallet file ${filePath}, but it was not a 'file not found' error. Please check the file.`, error);
      throw error; // Rethrow unexpected errors
    }

    // File does not exist, proceed to create it.
    if (nonInteractive) {
        logger.info('No existing node identity found. Creating a new one...');
        const libp2pCrypto = await import('@libp2p/crypto');
        privateKey = await libp2pCrypto.keys.generateKeyPair('Ed25519');
        const marshalledKey = libp2pCrypto.keys.privateKeyToProtobuf(privateKey);

        const walletData = {
            version: '1.0',
            type: 'Ed25519',
            // No personal details for the node's own identity wallet
            privateKey: Buffer.from(marshalledKey).toString('base64'),
            created: new Date().toISOString()
        };

        await writeFile(filePath, JSON.stringify(walletData, null, 2), 'utf8');
        logger.info(`✅ New node identity wallet created and saved to ${filePath}`);
    } else {
        // This part remains for any potential interactive CLI tools
        if (!rl) throw new Error("Readline interface is required for interactive wallet creation.");

        const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

        logger.info('\n################################################################');
        logger.info('Creating a new wallet. Please provide the following information:');
        country = await askQuestion('  - 2-letter ISO Country Code (e.g., FR for France): ');
        city = await askQuestion('  - City: ');
        const nationalId = await askQuestion('  - National ID Number (will not be stored): ');
        logger.info('################################################################\n');

        nationalIdHash = createHash('sha256').update(nationalId.trim()).digest('hex');
        logger.info('✅ National ID securely hashed.');

        const libp2pCrypto = await import('@libp2p/crypto');
        privateKey = await libp2pCrypto.keys.generateKeyPair('Ed25519');
        accountType = 'standard';

        const marshalledKey = libp2pCrypto.keys.privateKeyToProtobuf(privateKey);
        const walletData = {
            version: '1.0',
            type: 'Ed25519',
            accountType,
            country: country.trim(),
            city: city.trim(),
            nationalIdHash,
            privateKey: Buffer.from(marshalledKey).toString('base64'),
            created: new Date().toISOString()
        };

        await writeFile(filePath, JSON.stringify(walletData, null, 2), 'utf8');
        logger.info(`✅ New wallet created and saved (Account Type: ${accountType})`);
    }
  }

  return { privateKey, accountType, country, city, nationalIdHash };
}


/**
 * Creates a new user wallet file with the given details.
 * @param {string} filePath - Path to save the new wallet file.
 * @param {object} details - Wallet details.
 * @param {string} details.name - Name of the wallet.
 * @param {string} details.country - Country code.
 * @param {string} details.city - City.
 * @param {string} details.nationalId - National ID number.
 * @param {string} details.accountType - Type of account ('individual' or 'entreprise').
 * @returns {Promise<object>} The created wallet data, including the private key object.
 */
export async function createWallet(filePath, { name, country, city, nationalId, accountType }) {
  const nationalIdHash = createHash('sha256').update(nationalId.trim()).digest('hex');
  const libp2pCrypto = await import('@libp2p/crypto');
  const privateKey = await libp2pCrypto.keys.generateKeyPair('Ed25519');
  const marshalledKey = libp2pCrypto.keys.privateKeyToProtobuf(privateKey);

  const walletData = {
    name,
    version: '1.0',
    type: 'Ed25519',
    accountType,
    country: country.trim(),
    city: city.trim(),
    nationalIdHash,
    privateKey: Buffer.from(marshalledKey).toString('base64'),
    created: new Date().toISOString()
  };

  await writeFile(filePath, JSON.stringify(walletData, null, 2), 'utf8');
  logger.info(`✅ New user wallet created and saved to ${filePath}`);

  // Return the full wallet data along with the unmarshalled private key object
  return {
    privateKey, // The actual privateKey object
    ...walletData
  };
}
