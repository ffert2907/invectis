import { createEd25519PeerId, createFromPrivKey } from '@libp2p/peer-id-factory'
import { readFile, writeFile } from 'fs/promises'

/**
 * Initialise ou charge un portefeuille cryptographique
 * @param {string} filePath - Chemin vers le fichier du portefeuille
 * @returns {Promise<{peerId: PeerId, sign: function}>} - Objet contenant le peerId et une fonction de signature
 */
export async function initializeWallet(filePath) {
  let peerId
  let privateKey

  try {
    console.log('🔍 DEBUG: Tentative de lecture du fichier wallet:', filePath)
    
    // Tentative de lecture du fichier existant
    const data = await readFile(filePath, 'utf8')
    console.log('🔍 DEBUG: Fichier wallet lu, tentative de parsing JSON...')
    
    // Nouveau format: stockage en JSON avec les clés exportées
    const walletData = JSON.parse(data)
    console.log('🔍 DEBUG: Format JSON détecté')
    
    if (walletData.version !== '1.0' || !walletData.privateKey) {
      throw new Error('Format de wallet invalide ou obsolète')
    }
    
    // Conversion des données base64 vers Uint8Array
    const privateKeyBytes = new Uint8Array(Buffer.from(walletData.privateKey, 'base64'))
    console.log('🔍 DEBUG: Clé privée convertie, taille:', privateKeyBytes.length)
    
    // Recréation du PeerId à partir des bytes de la clé privée Ed25519
    peerId = await createFromPrivKey(privateKeyBytes)
    privateKey = peerId.privateKey
    
    console.log('✅ Portefeuille existant chargé (format JSON)')
    
  } catch (error) {
    console.log('🔍 DEBUG: Erreur de lecture/parsing:', error.message)
    
    if (error.code === 'ENOENT') {
      console.log('🔍 DEBUG: Fichier inexistant, création d\'un nouveau wallet...')
    } else {
      console.log('🔍 DEBUG: Fichier corrompu ou format obsolète, recréation...')
    }
    
    // Création d'un nouveau portefeuille si le fichier n'existe pas ou est corrompu
    peerId = await createEd25519PeerId()
    privateKey = peerId.privateKey
    
	// Sauvegarde dans le nouveau format JSON
	const walletData = {
	  version: '1.0',
	  type: 'Ed25519',
	  // LIGNE CORRIGÉE : On utilise directement `privateKey` car c'est déjà un Uint8Array
	  privateKey: Buffer.from(privateKey).toString('base64'),
	  // LIGNE CORRIGÉE : On utilise directement `peerId.publicKey`
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
      const signature = await privateKey.sign(data)
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