import { readFile, writeFile } from 'fs/promises'
import { logger } from './config.js'
import { createHash } from 'crypto'

/**
 * Initialise ou charge un portefeuille cryptographique.
 * Cette fonction gère la création d'une nouvelle clé privée ou le chargement d'une clé existante.
 * @param {string} filePath - Chemin vers le fichier du portefeuille.
 * @param {import('readline').Interface} rl - L'interface readline pour les entrées utilisateur.
 * @returns {Promise<{privateKey: import('@libp2p/interface-keys').PrivateKey, accountType: string, country: string, city: string, nationalIdHash: string}>} - Un objet contenant la clé privée libp2p et les métadonnées du portefeuille.
 */
export async function initializeWallet(filePath, rl) {
  let privateKey
  let accountType, country, city, nationalIdHash

  try {
    logger.debug('Attempting to load wallet from:', filePath)
    const data = await readFile(filePath, 'utf8')
    const walletData = JSON.parse(data)

    if (walletData.version !== '1.0' || !walletData.privateKey) {
      throw new Error('Invalid or outdated wallet format.')
    }

    const libp2pCrypto = await import('@libp2p/crypto')
    const marshalledPrivKey = new Uint8Array(Buffer.from(walletData.privateKey, 'base64'))
    privateKey = await libp2pCrypto.keys.privateKeyFromProtobuf(marshalledPrivKey)
    
    accountType = walletData.accountType || 'standard'
    country = walletData.country
    city = walletData.city
    nationalIdHash = walletData.nationalIdHash
    logger.info(`✅ Existing wallet loaded (Account Type: ${accountType})`)

  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.debug(`Error reading wallet, will create a new one. Error: ${error.message}`)
    }
    
    const askQuestion = (rl, query) => new Promise(resolve => rl.question(query, resolve))

    logger.info('\n################################################################')
    logger.info('Creating a new wallet. Please provide the following information:')
    country = await askQuestion(rl, '  - 2-letter ISO Country Code (e.g., FR for France): ')
    city = await askQuestion(rl, '  - City: ')
    const nationalId = await askQuestion(rl, '  - National ID Number (will not be stored): ')
    logger.info('################################################################\n')

    nationalIdHash = createHash('sha256').update(nationalId.trim()).digest('hex')
    logger.info('✅ National ID securely hashed.')

    const libp2pCrypto = await import('@libp2p/crypto')
    privateKey = await libp2pCrypto.keys.generateKeyPair('Ed25519')
    accountType = 'standard'
    
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
  }

  return {
    privateKey,
    accountType,
    country,
    city,
    nationalIdHash
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
