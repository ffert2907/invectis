import { peerIdFromString } from '@libp2p/peer-id'
import { promises as fs } from 'fs';
import { VECTORS } from './vectors.js';
import { ACCOUNT_RIGHTS } from './rights.js';

let ratesCache = null;

function hasRight(accountType, transactionType) {
  if (!ACCOUNT_RIGHTS[accountType] || !ACCOUNT_RIGHTS[accountType].includes(transactionType)) {
    throw new Error(`Account type '${accountType}' is not authorized to perform '${transactionType}' transactions.`);
  }
  return true;
}

async function getRates() {
  if (ratesCache) {
    return ratesCache;
  }
  const data = await fs.readFile('rates.json', 'utf8');
  ratesCache = JSON.parse(data);
  return ratesCache;
}

export async function updateRates(newRates) {
  const currentRatesData = await getRates();
  const newHistoryEntry = {
    date: new Date().toISOString(),
    rates: currentRatesData.currentRates
  };
  currentRatesData.history.push(newHistoryEntry);
  currentRatesData.currentRates = newRates;
  await fs.writeFile('rates.json', JSON.stringify(currentRatesData, null, 2));
  ratesCache = null; // Invalidate cache
}


/**
 * Crée une transaction de paiement factice
 * @param {PeerId} authorPeerId - Identité de l'expéditeur
 * @param {PeerId} recipientPeerId - Identité du destinataire
 * @param {string} accountType - Le type de compte de l'expéditeur
 * @returns {Object} - Transaction non signée
 */
export function createPaymentTransaction(wallet, recipientPeerId, description, reference) {
  // No rights check for this transaction type
  return {
    type: 'PAYMENT',
    from: wallet.peerId.toString(),
    to: recipientPeerId.toString(),
    timestamp: Date.now(),
    description: description || '',
    reference: reference || '',
    payload: {
      amount: Math.floor(Math.random() * 100) + 1,
      currency: 'TOKEN'
    }
  }
}

/**
 * Crée une transaction pour demander la validation d'un compte
 * @param {object} wallet - Le portefeuille de l'expéditeur
 * @param {PeerId} recipientPeerId - Identité du destinataire de la demande
 * @returns {Object} - Transaction non signée
 */
export function createAskValidationAccountTransaction(wallet, recipientPeerId, description, reference) {
  hasRight(wallet.accountType, 'ASK_VALIDATION_ACCOUNT')
  return {
    type: 'ASK_VALIDATION_ACCOUNT',
    from: wallet.peerId.toString(),
    to: recipientPeerId.toString(),
    timestamp: Date.now(),
    description: description || '',
    reference: reference || '',
    payload: {
      message: 'Please provide your identity information for validation.'
    }
  }
}

/**
 * Crée une transaction pour envoyer une information
 * @param {object} wallet - Le portefeuille de l'expéditeur
 * @param {string} message - Le message d'information
 * @returns {Object} - Transaction non signée
 */
export function createInformationTransaction(wallet, message, description, reference) {
  hasRight(wallet.accountType, 'INFORMATION')
  return {
    type: 'INFORMATION',
    from: wallet.peerId.toString(),
    timestamp: Date.now(),
    description: description || '',
    reference: reference || '',
    payload: {
      message
    }
  }
}

/**
 * Crée une transaction pour poser une question de sondage
 * @param {object} wallet - Le portefeuille de l'expéditeur
 * @param {string} question - La question du sondage
 * @param {string} type - Le type de sondage ('radio' or 'checkbox')
 * @param {Array<string>} options - Les options de réponse
 * @returns {Object} - Transaction non signée
 */
export function createPollQuestionTransaction(wallet, question, type, options, description, reference) {
  hasRight(wallet.accountType, 'POLL_QUESTION')
  const pollId = Date.now()
  return {
    type: 'POLL_QUESTION',
    from: wallet.peerId.toString(),
    timestamp: pollId,
    description: description || '',
    reference: reference || '',
    payload: {
      pollId,
      question,
      type,
      options
    }
  }
}

/**
 * Crée une transaction pour répondre à un sondage
 * @param {object} wallet - Le portefeuille de l'expéditeur
 * @param {number} pollId - L'ID du sondage auquel on répond
 * @param {string|Array<string>} answer - La réponse
 * @returns {Object} - Transaction non signée
 */
export function createPollAnswerTransaction(wallet, pollId, answer, description, reference) {
  // No rights check for this transaction type
  return {
    type: 'POLL_ANSWER',
    from: wallet.peerId.toString(),
    timestamp: Date.now(),
    description: description || '',
    reference: reference || '',
    payload: {
      pollId,
      answer
    }
  }
}

/**
 * Crée une transaction pour valider un compte
 * @param {object} wallet - Le portefeuille de l'expéditeur (celui qui valide)
 * @param {PeerId} recipientPeerId - Identité du compte qui est validé
 * @returns {Object} - Transaction non signée
 */
export function createAccountValidationTransaction(wallet, recipientPeerId, description, reference) {
  // No rights check for this transaction type
  return {
    type: 'ACCOUNT_VALIDATION',
    from: wallet.peerId.toString(),
    to: recipientPeerId.toString(),
    timestamp: Date.now(),
    description: description || '',
    reference: reference || '',
    payload: {
      validated: true
    }
  }
}

/**
 * Crée une transaction pour définir les ratios de conversion des vecteurs
 * @param {object} wallet - Le portefeuille de l'émetteur (doit être autorisé)
 * @param {object} newRates - Les nouveaux ratios pour les vecteurs
 * @returns {Object} - Transaction non signée
 */
export function createSetRateRatioTransaction(wallet, newRates, description, reference) {
  hasRight(wallet.accountType, 'SETRATERATIO')
  // Validation simple pour s'assurer que les nouveaux taux sont valides
  for (const vector of VECTORS) {
    const vectorName = vector[0]
    if (!newRates[vectorName] || typeof newRates[vectorName] !== 'number') {
      throw new Error(`Le ratio pour le vecteur ${vectorName} est manquant ou invalide.`)
    }
  }

  return {
    type: 'SETRATERATIO',
    from: wallet.peerId.toString(),
    timestamp: Date.now(),
    description: description || '',
    reference: reference || '',
    payload: {
      rates: newRates,
      country: wallet.country,
      city: wallet.city
    }
  }
}

/**
 * Crée une transaction pour définir le bonus journalier
 * @param {object} wallet - Le portefeuille de l'utilisateur
 * @param {number} walletBalance - Le solde actuel du portefeuille en "Heure"
 * @param {number} dailyTransactionSum - La somme des transactions de la journée en "Heure"
 * @returns {Object} - Transaction non signée
 */
export function createSetDailyBonusTransaction(wallet, walletBalance, dailyTransactionSum, description, reference) {
  hasRight(wallet.accountType, 'SETDAILYBONUS')
  let bonus = 0
  if (walletBalance < 8) {
    if (dailyTransactionSum !== 0) {
      bonus = 8 - walletBalance
    } else {
      bonus = 0
    }
  } else {
    if (dailyTransactionSum < 0) {
      bonus = Math.min(8, -1 * dailyTransactionSum)
    } else {
      bonus = 0
    }
  }

  // On ne crée une transaction que si le bonus est positif
  if (bonus <= 0) {
    return null
  }

  return {
    type: 'SETDAILYBONUS',
    from: wallet.peerId.toString(),
    timestamp: Date.now(),
    description: description || '',
    reference: reference || '',
    payload: {
      bonus: bonus
    }
  }
}

/**
 * Crée une transaction de vecteurs qui calcule la valeur temps totale
 * @param {object} wallet - Le portefeuille de l'expéditeur
 * @param {PeerId} recipientPeerId - Identité du destinataire
 * @param {object} vectorValues - Les valeurs pour chaque vecteur
 * @returns {Promise<Object>} - Transaction non signée
 */
export async function createVectorTransaction(wallet, recipientPeerId, vectorValues, description, reference) {
  hasRight(wallet.accountType, 'VECTOR_TRANSACTION')
  const { currentRates } = await getRates()
  let totalTime = 0

  for (const vector of VECTORS) {
    const vectorName = vector[0]
    const value = vectorValues[vectorName] || 0
    if (typeof value !== 'number') {
      throw new Error(`La valeur pour le vecteur ${vectorName} est invalide.`)
    }
    totalTime += value * currentRates[vectorName]
  }

  return {
    type: 'VECTOR_TRANSACTION',
    from: wallet.peerId.toString(),
    to: recipientPeerId.toString(),
    timestamp: Date.now(),
    description: description || '',
    reference: reference || '',
    payload: {
      vectors: vectorValues,
      totalTime: totalTime
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
    
    // CORRECTION: Convertir la signature (reçue en base64) en Uint8Array
    const signatureBytes = new Uint8Array(Buffer.from(signature, 'base64'))

    // Conversion des données en Uint8Array pour la vérification
    const encoder = new TextEncoder()
    const dataBytes = encoder.encode(JSON.stringify(dataToVerify))
    
    // Vérification de la signature
    return await authorPeerId.publicKey.verify(dataBytes, signatureBytes)
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
    // CORRECTION: Convertir la signature en base64 pour la sérialisation JSON
    signature: Buffer.from(signature).toString('base64')
  }
}