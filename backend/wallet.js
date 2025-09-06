import { readFile, writeFile } from 'fs/promises'
import { logger } from './config.js'
import { createHash } from 'crypto'

/**
 * Loads a wallet from a file.
 * @param {string} filePath - Path to the wallet file.
 * @returns {Promise<{privateKey: import('@libp2p/interface-keys').PrivateKey, accountType: string, country: string, city: string, nationalIdHash: string}>} - Wallet data.
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
  const nationalIdHash = walletData.nationalIdHash
  logger.info(`✅ Existing wallet loaded (Account Type: ${accountType})`)

  return {
    privateKey,
    accountType,
    country,
    city,
    nationalIdHash
  }
}


/**
 * Initialise ou charge un portefeuille cryptographique de manière interactive.
 * Si le portefeuille n'existe pas, il guide l'utilisateur pour en créer un.
 * @param {string} filePath - Chemin vers le fichier du portefeuille.
 * @param {import('readline').Interface} rl - L'interface readline pour les entrées utilisateur.
 * @returns {Promise<{privateKey: import('@libp2p/interface-keys').PrivateKey, accountType: string, country: string, city: string, nationalIdHash: string}>} - Un objet contenant la clé privée libp2p et les métadonnées du portefeuille.
 */
export async function initializeWallet(filePath, rl) {
  try {
    return await loadWalletFromFile(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT' && !error.message.includes('Invalid or outdated wallet format.')) {
      logger.error('An unexpected error occurred while loading the wallet:', error);
      throw error; // Re-throw unexpected errors
    }

    // Wallet does not exist or is invalid, proceed with creation
    logger.info('No valid wallet found. Starting interactive creation...');

    const askQuestion = (rl, query) => new Promise(resolve => rl.question(query, resolve))

    logger.info('\n################################################################')
    logger.info('Creating a new wallet. Please provide the following information:')
    const country = await askQuestion(rl, '  - 2-letter ISO Country Code (e.g., FR for France): ')
    const city = await askQuestion(rl, '  - City: ')
    const nationalId = await askQuestion(rl, '  - National ID Number (will not be stored): ')
    logger.info('################################################################\n')

    const nationalIdHash = createHash('sha256').update(nationalId.trim()).digest('hex')
    logger.info('✅ National ID securely hashed.')

    const libp2pCrypto = await import('@libp2p/crypto')
    const privateKey = await libp2pCrypto.keys.generateKeyPair('Ed25519')
    const accountType = 'standard'

    const marshalledKey = libp2pCrypto.keys.privateKeyToProtobuf(privateKey)
    const walletData = {
      version: '1.0',
      type: 'Ed25519',
      accountType,
      country: country.trim(),
      city: city.trim(),
      nationalIdHash,
      privateKey: Buffer.from(marshalledKey).toString('base64'),
      created: new Date().toISOString()
    }

    await writeFile(filePath, JSON.stringify(walletData, null, 2), 'utf8')
    logger.info(`✅ New wallet created and saved (Account Type: ${accountType})`)

    return {
      privateKey,
      accountType,
      country: country.trim(),
      city: city.trim(),
      nationalIdHash
    }
  }
}

export async function createWallet(filePath, { country, city, nationalId, accountType }) {
  const nationalIdHash = createHash('sha256').update(nationalId.trim()).digest('hex');
  const libp2pCrypto = await import('@libp2p/crypto');
  const privateKey = await libp2pCrypto.keys.generateKeyPair('Ed25519');
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

  // Verify that the file was created
  try {
    await readFile(filePath, 'utf8');
  } catch (error) {
    logger.error('Failed to verify wallet file creation:', error);
    throw new Error('Failed to save wallet file.');
  }

  logger.info(`✅ New wallet created and saved (Account Type: ${accountType})`);

  return {
    privateKey,
    ...walletData
  };
}
