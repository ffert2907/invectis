import { createNode } from './p2p.js'
import { verifyTransaction } from './transaction.js'
import { calculateBalance, getNonce, hasReceivedBonusToday, calculateDailyTransactionSum } from './ledger.js'
import { formatTransactionForFrontend } from './api.js'
import { peerIdFromString } from '@libp2p/peer-id'
import { createSetDailyBonusPayload, signTransaction } from './transaction.js';
import { TextEncoder } from 'util';
import { json } from '@helia/json'
import { logger } from './config.js'

// Topic GossipSub pour le registre global
const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0'

// Shared application state
export const appContext = {
  node: null,
  wallet: null,
  j: null,
  dagHeads: [],
  receivedMessages: [],
  nullifiers: new Set(), // A set to store registered nullifiers
}

/**
 * Initializes the P2P node, sets up listeners, and manages shared state.
 * @param {object} wallet - The wallet object from initializeWallet or loadWalletFromFile.
 * @param {string} datastorePath - The path for the Helia datastore.
 * @returns {Promise<void>}
 */
export async function startNode(wallet, datastorePath) {
  logger.info('Core: Initializing P2P node...')

  // 1. Store wallet and create the P2P node
  appContext.wallet = wallet
  const node = await createNode(wallet.peerId, datastorePath)
  appContext.node = node
  appContext.j = json(node)

  // 2. Augment wallet object with node-derived info
  // The peerId is already in the wallet object from wallet.js
  appContext.wallet.sign = (data) => wallet.privateKey.sign(data)

  logger.info('Core: Identity:', appContext.wallet.peerId.toString())

  // 3. Start the node
  await node.start()
  logger.prod('Core: Node started successfully')

  // 4. Subscribe to the global topic
  await node.libp2p.services.pubsub.subscribe(GLOBAL_LEDGER_TOPIC)
  logger.prod(`Core: Subscribed to topic: ${GLOBAL_LEDGER_TOPIC}`)

  // 5. Set up message listener
  node.libp2p.services.pubsub.addEventListener('message', async (event) => {
    if (event.detail.topic !== GLOBAL_LEDGER_TOPIC) return

    try {
      logger.debug('Core: Message received on topic')
      const message = JSON.parse(new TextDecoder().decode(event.detail.data))
      logger.debug('Core: Message decoded:', message)

      const authorPeerId = peerIdFromString(message.author)
      let isValid = await verifyTransaction(message, authorPeerId)

      // Additional validation for REGISTER transactions
      if (isValid && message.type === 'REGISTER') {
        const { nullifier } = message.payload;
        if (appContext.nullifiers.has(nullifier)) {
          logger.warn(`Core: Duplicate nullifier found: ${nullifier}. Rejecting transaction.`);
          isValid = false; // Mark as invalid
        }
      }

      // Additional validation for PAYMENT and VECTOR_TRANSACTION
      if (isValid && (message.type === 'PAYMENT' || message.type === 'VECTOR_TRANSACTION')) {
        const authorId = message.author;
        const payload = message.payload;
        const amountToSpend = message.type === 'PAYMENT' ? payload.amount : payload.totalTime;

        // 1. Check balance
        const balance = await calculateBalance(authorId, appContext.dagHeads, appContext.j);
        if (balance < amountToSpend) {
          logger.warn(`Core: Insufficient funds for ${authorId}. Balance: ${balance}, required: ${amountToSpend}. Rejecting transaction.`);
          isValid = false;
        }

        // 2. Check nonce for double-spend prevention
        if (isValid) {
          const expectedNonce = await getNonce(authorId, appContext.dagHeads, appContext.j);
          if (payload.nonce !== expectedNonce) {
            logger.warn(`Core: Invalid nonce for ${authorId}. Expected: ${expectedNonce}, got: ${payload.nonce}. Rejecting transaction.`);
            isValid = false;
          }
        }
      }

      if (isValid) {
        // If it's a valid REGISTER transaction, add the nullifier to the set
        if (message.type === 'REGISTER') {
          const { nullifier } = message.payload;
          appContext.nullifiers.add(nullifier);
          logger.info(`Core: New nullifier registered: ${nullifier}`);
        }

        const cid = await appContext.j.add(message)
        logger.prod(`Core: Valid transaction received and stored. CID: ${cid.toString()}`)

        // Update DAG heads
        const parentStrings = message.parents || []
        const remainingHeads = appContext.dagHeads.filter(h => !parentStrings.includes(h.toString()))
        appContext.dagHeads = [...remainingHeads, cid]
        logger.debug('Core: New DAG heads:', appContext.dagHeads.map(h => h.toString()))

        // Store for API retrieval
        const formattedMessage = formatTransactionForFrontend(cid, message);
        appContext.receivedMessages.unshift(formattedMessage); // Add to the beginning of the array
        if (appContext.receivedMessages.length > 50) { // Keep last 50 messages
            appContext.receivedMessages.pop();
        }

        logger.info(`✅ Transaction processed (type: ${message.type}) from ${message.author}`)

      } else {
        logger.warn(`Core: Received invalid transaction! Type: ${message.type}, Author: ${message.author}`)
      }
    } catch (error) {
      logger.error('Core: Error processing message:', error)
    }
  })
}

/**
 * Checks for and applies the daily bonus if the user is eligible.
 * This function is designed to be called before any payment transaction.
 * @param {object} [deps] - Optional dependencies for testing.
 * @param {function} [deps.hasReceivedBonusToday]
 * @param {function} [deps.calculateBalance]
 * @param {function} [deps.calculateDailyTransactionSum]
 */
export async function applyAutomaticBonus(deps = {}) {
  const {
    hasReceivedBonusToday: _hasReceivedBonusToday = hasReceivedBonusToday,
    calculateBalance: _calculateBalance = calculateBalance,
    calculateDailyTransactionSum: _calculateDailyTransactionSum = calculateDailyTransactionSum
  } = deps;

  const alreadyReceivedBonus = await _hasReceivedBonusToday(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j);

  if (!alreadyReceivedBonus) {
    logger.info('User has not received a daily bonus today. Calculating now...');
    const bonusWalletBalance = await _calculateBalance(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j);
    const bonusDailyTransactionSum = await _calculateDailyTransactionSum(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j);
    const bonusPayload = createSetDailyBonusPayload(appContext.wallet, bonusWalletBalance, bonusDailyTransactionSum, 'Automatic Daily Bonus', 'ref-auto-bonus-001');

    if (bonusPayload && bonusPayload.bonus > 0) {
      logger.info(`✅ Awarding an automatic daily bonus of ${bonusPayload.bonus}.`);
      const bonusTransactionToSign = {
        parents: appContext.dagHeads.map(cid => cid.toString()),
        author: appContext.wallet.peerId.toString(),
        timestamp: Date.now(),
        type: 'SETDAILYBONUS',
        payload: bonusPayload
      };
      const signedBonusTransaction = await signTransaction(bonusTransactionToSign, appContext.wallet.sign);
      const bonusCid = await appContext.j.add(signedBonusTransaction);

      // Update DAG heads correctly
      const parentStrings = signedBonusTransaction.parents || [];
      const remainingHeads = appContext.dagHeads.filter(h => !parentStrings.includes(h.toString()));
      appContext.dagHeads = [...remainingHeads, bonusCid];

      const bonusMessageBytes = new TextEncoder().encode(JSON.stringify(signedBonusTransaction));
      await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, bonusMessageBytes);
      logger.info('✅ Bonus transaction published to the network!');
    } else {
      logger.info('No automatic daily bonus to add at this time.');
    }
  } else {
    logger.info('User has already received a daily bonus today.');
  }
}
