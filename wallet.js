import { createEd25519PeerId, createFromPrivKey } from '@libp2p/peer-id-factory'
import { readFile, writeFile } from 'fs/promises'
import { ed25519 } from '@noble/curves/ed25519.js'

/**
 * Extracts the 32-byte seed from a marshalled libp2p private key.
 * @param {Uint8Array} marshalledPrivKey - The 68-byte marshalled private key.
 * @returns {Uint8Array} - The 32-byte seed.
 */
function extractSeedFromMarshalledKey(marshalledPrivKey) {
  // A standard marshalled Ed25519 key from libp2p is 68 bytes:
  // 4 bytes of protobuf header + 64 bytes of raw key data.
  if (marshalledPrivKey.length === 68) {
    // The raw key is the 64 bytes after the 4-byte protobuf header.
    const rawKey = marshalledPrivKey.slice(4)
    // The first 32 bytes of the raw key is the seed used for signing.
    return rawKey.slice(0, 32)
  }

  // Fallback for raw 32-byte seeds, just in case.
  if (marshalledPrivKey.length === 32) {
    return marshalledPrivKey
  }

  throw new Error(`Unsupported private key length: ${marshalledPrivKey.length}. Expected 32 or 68 bytes.`)
}

/**
 * Initialise ou charge un portefeuille cryptographique
 * @param {string} filePath - Chemin vers le fichier du portefeuille
 * @returns {Promise<{peerId: PeerId, sign: function}>} - Objet contenant le peerId et une fonction de signature
 */
export async function initializeWallet(filePath) {
  let peerId
  let privateKeySeed // This will be the 32-byte seed

  try {
    console.log('🔍 DEBUG: Tentative de lecture du fichier wallet:', filePath)
    
    const data = await readFile(filePath, 'utf8')
    console.log('🔍 DEBUG: Fichier wallet lu, tentative de parsing JSON...')
    
    const walletData = JSON.parse(data)
    console.log('🔍 DEBUG: Format JSON détecté')
    
    if (walletData.version !== '1.0' || !walletData.privateKey) {
      throw new Error('Format de wallet invalide ou obsolète')
    }
    
    const marshalledPrivKey = new Uint8Array(Buffer.from(walletData.privateKey, 'base64'))
    console.log('🔍 DEBUG: Clé privée convertie, taille:', marshalledPrivKey.length)
    
    // We create the peerId from the full marshalled key to ensure consistency
    peerId = await createFromPrivKey(marshalledPrivKey)
    // We extract just the seed for signing purposes
    privateKeySeed = extractSeedFromMarshalledKey(marshalledPrivKey)
    
    console.log('✅ Portefeuille existant chargé (format JSON)')
    
  } catch (error) {
    console.log('🔍 DEBUG: Erreur de lecture/parsing:', error.message)
    
    if (error.code === 'ENOENT') {
      console.log("🔍 DEBUG: Fichier inexistant, création d'un nouveau wallet...")
    } else {
      console.log('🔍 DEBUG: Fichier corrompu ou format obsolète, recréation...')
    }
    
    peerId = await createEd25519PeerId()
    // Extract the seed from the newly created key
    privateKeySeed = extractSeedFromMarshalledKey(peerId.privateKey)
    
	const walletData = {
	  version: '1.0',
	  type: 'Ed25519',
      // We still save the full marshalled key from libp2p
	  privateKey: Buffer.from(peerId.privateKey).toString('base64'),
	  publicKey: Buffer.from(peerId.publicKey).toString('base64'),
	  peerId: peerId.toString(),
	  created: new Date().toISOString()
	}
    
    await writeFile(filePath, JSON.stringify(walletData, null, 2), 'utf8')
    console.log('✅ Nouveau portefeuille créé et sauvegardé (format JSON)')
  }

  console.log('🔍 DEBUG: PeerId final:', peerId.toString())
  console.log('🔍 DEBUG: Type de clé:', peerId.type)

  /**
   * Signe des données avec la clé privée du portefeuille
   * @param {Uint8Array} data - Données à signer
   * @returns {Promise<Uint8Array>} - Signature
   */
  const sign = async (data) => {
    console.log('🔍 DEBUG: Signature de données, taille:', data.length)
    try {
      // Use the @noble/curves library to sign with the raw seed
      const signature = ed25519.sign(data, privateKeySeed)
      console.log('🔍 DEBUG: Signature créée, taille:', signature.length)
      return signature
    } catch (error) {
      console.error('❌ Erreur de signature:', error)
      throw error
    }
  }

  return {
    peerId,
    sign
  }
}