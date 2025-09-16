import { createNode } from './p2p.js'
import { signAttestation } from './wallet.js'
import { verifyTransaction } from './transaction.js'
import { calculateBalance, getNonce, hasReceivedBonusToday, calculateDailyTransactionSum } from './ledger.js'
import { formatTransactionForFrontend } from './api.js'
import { peerIdFromString } from '@libp2p/peer-id'
import { createSetDailyBonusPayload, signTransaction } from './transaction.js';
import { TextEncoder } from 'util';
import { json } from '@helia/json'
import { logger } from './config.js'
import { CID } from 'multiformats/cid'

// Topic GossipSub pour le registre global
const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0'

// Shared application state
export const appContext = {
  node: null,
  wallet: null,
  attestation: null, // To store the current wallet-node attestation
  j: null,
  dagHeads: [],
  receivedMessages: [],
  nullifiers: new Set(), // A set to store registered nullifiers
  publishQueue: [], // A queue for transactions that need to be published
}

/**
 * Recursively fetches all blocks in a DAG starting from a given CID.
 * It uses the provided Helia instance, which will automatically use Bitswap
 * to retrieve blocks from the network if they are not available locally.
 * @param {CID} cid - The root CID of the DAG to fetch.
 * @param {import('@helia/json').HeliaJSON} heliaJsonInstance - The Helia/JSON instance.
 * @param {Set<string>} visited - A set to keep track of visited CIDs to avoid re-fetching.
 */
async function fetchDag(cid, heliaJsonInstance, visited = new Set()) {
  const cidString = cid.toString();
  if (visited.has(cidString)) {
    return; // Already visited or in the process of fetching
  }
  visited.add(cidString);
  logger.info(`Fetching DAG for CID: ${cidString}`);

  try {
    const transaction = await heliaJsonInstance.get(cid);
    if (!transaction) {
      logger.warn(`Could not fetch block for CID: ${cidString}`);
      return;
    }
    logger.info(`Successfully fetched block for CID: ${cidString}`);

    if (transaction.parents && transaction.parents.length > 0) {
      for (const parentCidString of transaction.parents) {
        await fetchDag(CID.parse(parentCidString), heliaJsonInstance, visited);
      }
    }
  } catch (error) {
    logger.error(`Error fetching block for CID ${cidString}:`, error);
  }
}

/**
 * Initializes the P2P node, sets up listeners, and manages shared state.
 * @param {object} wallet - The wallet object from initializeWallet or loadWalletFromFile.
 * @param {string} datastorePath - The path for the Helia datastore.
 * @returns {Promise<void>}
 */
/**
 * Creates an attestation signing the node's PeerId with the wallet's private key
 * and sets it on the node.
 * @param {object} node - The Helia node instance.
 * @param {object} wallet - The wallet object.
 * @returns {Promise<object>} The signed attestation object.
 */
export async function createAndSetAttestation(node, wallet) {
  logger.info('Core: Creating and setting new attestation...');
  const nodePeerId = node.libp2p.peerId;
  const signedAttestation = await signAttestation(wallet.privateKey, wallet.peerId, nodePeerId);
  node.setAttestation(signedAttestation);
  logger.info('Core: New attestation has been set on the running node.');
  return signedAttestation;
}

export async function startNode(wallet, datastorePath) {
  if (wallet) {
    logger.info('Core: Initializing P2P node with wallet...');
  } else {
    logger.info('Core: Initializing P2P node in relay/bootstrap mode (no wallet)...');
  }

  // 1. Create the P2P node. It will generate its own ephemeral PeerID.
  const node = await createNode(datastorePath);
  appContext.node = node;
  appContext.wallet = wallet;
  appContext.j = json(node);

  if (wallet) {
    // 2. Create and set the initial attestation.
    appContext.attestation = await createAndSetAttestation(node, wallet);

    // 3. Set the head provider for the P2P layer
    node.setHeadProvider(() => {
      if (appContext.dagHeads.length === 0) return null;
      return appContext.dagHeads[appContext.dagHeads.length - 1];
    });

    // 4. Augment wallet object with a signing function for convenience.
    appContext.wallet.sign = (data) => wallet.privateKey.sign(data);

    const nodePeerId = node.libp2p.peerId;
    logger.prod(`Core: Wallet ID: ${wallet.peerId.toString()}`);
    logger.prod(`Core: Node ID:   ${nodePeerId.toString()}`);
    logger.info('Core: Attestation created and set.');
  }

  // 5. Start the node
  await node.start();
  logger.prod('Core: Node started successfully');

  // After starting, try to sync with the network
  try {
    const BOOTSTRAP_PEER_ID = 'QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN';
    const peerId = peerIdFromString(BOOTSTRAP_PEER_ID);

    logger.info(`Core: Querying bootstrap peer ${BOOTSTRAP_PEER_ID} for its latest head...`);
    const headCid = await appContext.node.getHeadFrom(peerId);

    if (headCid) {
      logger.info(`Core: Received head ${headCid.toString()} from bootstrap peer. Fetching its history...`);
      await fetchDag(headCid, appContext.j);

      const headCidString = headCid.toString();
      if (!appContext.dagHeads.find(h => h.toString() === headCidString)) {
          appContext.dagHeads.push(headCid);
          logger.info(`Core: Added new head from bootstrap peer: ${headCidString}`);
      }
    } else {
      logger.warn(`Core: Could not get head from bootstrap peer ${BOOTSTRAP_PEER_ID}. It might be offline or not have a head.`);
    }
  } catch (err) {
    logger.error('Core: Error while syncing with bootstrap peer:', err);
  }

  // 6. Subscribe to the global topic
  await node.libp2p.services.pubsub.subscribe(GLOBAL_LEDGER_TOPIC);
  logger.prod(`Core: Subscribed to topic: ${GLOBAL_LEDGER_TOPIC}`);

  // 7. Set up message listener
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

        // Before adding the new transaction, ensure its parents are fetched
        if (message.parents && message.parents.length > 0) {
            logger.info(`Core: New transaction has parents. Fetching their history...`);
            for (const parentCidString of message.parents) {
                await fetchDag(CID.parse(parentCidString), appContext.j);
            }
        }

        const cid = await appContext.j.add(message)
        logger.prod(`Core: Valid transaction received and stored. CID: ${cid.toString()}`)

        // Pin the new CID to ensure it's replicated
        appContext.node.pin(cid);
        logger.info(`Core: Pinned new transaction CID: ${cid.toString()}`);

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

      // Pin the new bonus transaction CID
      appContext.node.pin(bonusCid);
      logger.info(`Core: Pinned bonus transaction CID: ${bonusCid.toString()}`);

      // Update DAG heads correctly
      const parentStrings = signedBonusTransaction.parents || [];
      const remainingHeads = appContext.dagHeads.filter(h => !parentStrings.includes(h.toString()));
      appContext.dagHeads = [...remainingHeads, bonusCid];

      const bonusMessageBytes = new TextEncoder().encode(JSON.stringify(signedBonusTransaction));
      try {
        await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, bonusMessageBytes);
        logger.info('✅ Bonus transaction published to the network!');
      } catch (error) {
        if (error.message.includes('NoPeersSubscribedToTopic')) {
          logger.warn(`Core: Could not publish bonus transaction. No peers are subscribed to the topic. The transaction is still stored locally.`);
        } else {
          logger.error('Core: Error publishing bonus transaction:', error);
        }
      }
    } else {
      logger.info('No automatic daily bonus to add at this time.');
    }
  } else {
    logger.info('User has already received a daily bonus today.');
  }
}

/**
 * Starts a background process to handle publishing transactions from a queue.
 * This ensures that transactions (like registrations) are only sent when the
 * node is connected to peers.
 */
export function startTransactionQueueProcessor() {
  const anHour = 3600 * 1000;
  const interval = setInterval(async () => {
    // If the queue is empty or the node isn't ready, do nothing.
    if (appContext.publishQueue.length === 0 || !appContext.node) {
      return;
    }

    // Check for peers on the global topic
    const peers = appContext.node.libp2p.services.pubsub.getPeers(GLOBAL_LEDGER_TOPIC);
    if (peers.length === 0) {
      logger.debug('Queue: No peers found yet. Waiting for next interval.');
      return;
    }

    logger.info(`Queue: Found ${peers.length} peer(s). Processing transaction queue...`);

    // Get the next transaction to publish
    const signedTransaction = appContext.publishQueue[0]; // Peek at the first item

    // Check if the transaction is too old (e.g., > 1 hour)
    const transactionAge = Date.now() - signedTransaction.timestamp;
    if (transactionAge > anHour) {
      logger.warn(`Queue: Discarding expired transaction from author ${signedTransaction.author}`);
      appContext.publishQueue.shift(); // Remove the expired transaction
      return;
    }

    try {
      const messageBytes = new TextEncoder().encode(JSON.stringify(signedTransaction));
      await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, messageBytes);
      logger.prod(`Queue: Successfully published transaction of type ${signedTransaction.type} for ${signedTransaction.author}`);
      appContext.publishQueue.shift(); // Remove the successfully published transaction
    } catch (error) {
      logger.error(`Queue: Failed to publish transaction: ${error.message}. Will retry.`);
      // We don't remove the transaction, so it will be retried on the next interval.
    }
  }, 5000); // Check the queue every 5 seconds

  logger.info('✅ Transaction queue processor started.');

  // Note: In a real production app, you'd want a way to stop this interval on shutdown.
  // For this example, it will run until the process exits.
}
