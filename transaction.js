import { peerIdFromString } from '@libp2p/peer-id'

/**
 * Crée une transaction de paiement factice
 * @param {PeerId} authorPeerId - Identité de l'expéditeur
 * @param {PeerId} recipientPeerId - Identité du destinataire
 * @returns {Object} - Transaction non signée
 */
export function createPaymentTransaction(authorPeerId, recipientPeerId) {
  return {
    type: 'PAYMENT',
    from: authorPeerId.toString(),
    to: recipientPeerId.toString(),
    timestamp: Date.now(),
    payload: {
      amount: Math.floor(Math.random() * 100) + 1,
      currency: 'TOKEN'
    }
  }
}

/**
 * Vérifie la signature d'une transaction
 * @param {Object} transaction - Transaction à vérifier
 * @param {PeerId} authorPeerId - Identité de l'expéditeur présumé
 * @returns {Promise<boolean>} - True si la signature est valide
 */
export async function verifyTransaction(transaction, authorPeerId) {
  try {
    // Extraction de la signature et des données originales
    const { signature, ...dataToVerify } = transaction
    
    // Conversion des données en Uint8Array pour la vérification
    const encoder = new TextEncoder()
    const dataBytes = encoder.encode(JSON.stringify(dataToVerify))
    
    // Vérification de la signature
    return await authorPeerId.publicKey.verify(dataBytes, signature)
  } catch (error) {
    console.error('Erreur lors de la vérification:', error)
    return false
  }
}

/**
 * Signe une transaction
 * @param {Object} transaction - Transaction à signer
 * @param {Function} signFunction - Fonction de signature
 * @returns {Promise<Object>} - Transaction signée
 */
export async function signTransaction(transaction, signFunction) {
  // Conversion des données en Uint8Array pour la signature
  const encoder = new TextEncoder()
  const dataBytes = encoder.encode(JSON.stringify(transaction))
  
  // Signature des données
  const signature = await signFunction(dataBytes)
  
  // Ajout de la signature à la transaction
  return {
    ...transaction,
    signature
  }
}