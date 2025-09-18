import { promises as fs } from 'fs';
import { createNode } from './p2p_new.js'
import { signAttestation } from './wallet.js'
import { verifyTransaction } from './transaction.js'
import { decryptPayload } from './crypto.js'
import { calculateBalance, getNonce, hasReceivedBonusToday, calculateDailyTransactionSum } from './ledger.js'
import { formatTransactionForFrontend } from './api.js'
import { peerIdFromString } from '@libp2p/peer-id'
import { createSetDailyBonusPayload, signTransaction } from './transaction.js';
import { TextEncoder } from 'util';
import { json } from '@helia/json'
import { logger, MAX_PIN_SIZE } from './config.js'
import { CID } from 'multiformats/cid'
import path from 'path'
import { PinManager, GarbageCollector } from './storage.js'
import { ReplicationManager } from './replication.js'
import { ReputationManager, RateLimiter } from './security.js'

const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0'

export const appContext = {
  node: null, wallet: null, attestation: null, j: null,
  dagHeads: [], receivedMessages: [], nullifiers: new Set(),
  publishQueue: [], pinManager: null, replicationManager: null,
  gc: null, reputationManager: null, pubsubRateLimiter: null
}

async function fetchDag(cid, heliaJsonInstance, visited = new Set()) {
  const cidString = cid.toString();
  if (visited.has(cidString)) return;
  visited.add(cidString);
  try {
    const transaction = await heliaJsonInstance.get(cid);
    if (transaction && transaction.parents && transaction.parents.length > 0) {
      for (const parentCidString of transaction.parents) {
        await fetchDag(CID.parse(parentCidString), heliaJsonInstance, visited);
      }
    }
  } catch (error) {
    logger.error(`Error fetching block for CID ${cidString}:`, error);
  }
}

export async function createAndSetAttestation(node, wallet) {
  logger.info('Core: Creating and setting new attestation...');
  const signedAttestation = await signAttestation(wallet, node.libp2p.peerId);
  node.setAttestation(signedAttestation);
  return signedAttestation;
}

export async function saveDagHeads(datastorePath) {
  if (!appContext.dagHeads || appContext.dagHeads.length === 0) {
    logger.info('Core: No DAG heads to save.');
    return;
  }
  const headsPath = path.join(datastorePath, 'dag_heads.json');
  const headsAsString = appContext.dagHeads.map(cid => cid.toString());
  try {
    await fs.writeFile(headsPath, JSON.stringify(headsAsString, null, 2));
    logger.info(`Core: Successfully saved ${headsAsString.length} DAG heads to ${headsPath}`);
  } catch (error) {
    logger.error(`Core: Failed to save DAG heads to ${headsPath}:`, error);
  }
}

export async function loadDagHeads(datastorePath) {
  const headsPath = path.join(datastorePath, 'dag_heads.json');
  try {
    const headsData = await fs.readFile(headsPath, 'utf8');
    const headsAsString = JSON.parse(headsData);
    if (Array.isArray(headsAsString)) {
      appContext.dagHeads = headsAsString.map(str => CID.parse(str));
      logger.info(`Core: Successfully loaded ${appContext.dagHeads.length} DAG heads from ${headsPath}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info(`Core: No DAG heads file found at ${headsPath}. Starting with a fresh ledger.`);
      appContext.dagHeads = [];
    } else {
      logger.error(`Core: Failed to load DAG heads from ${headsPath}:`, error);
      appContext.dagHeads = [];
    }
  }
}

export async function startNode(wallet, datastorePath, options = {}) {
  logger.info('Core: Initializing P2P node...');
  appContext.reputationManager = new ReputationManager();
  appContext.pubsubRateLimiter = new RateLimiter(0.5, 2);
  logger.info('Core: Security components initialized.');

  // Use a sibling directory for the pin database to avoid conflicts.
  const pinDbPath = `${datastorePath}_pins`;

  const node = await createNode(datastorePath, appContext.reputationManager, options);
  appContext.node = node;
  appContext.wallet = wallet;
  appContext.j = json(node);

  const pinManager = new PinManager(pinDbPath);
  appContext.pinManager = pinManager;

  // Start the node and open the pin manager's database.
  await node.start();
  logger.prod('Core: Node started successfully');
  await pinManager.open();
  logger.info('Core: Pin manager initialized.');

  // Now that datastores are open and directories exist, load the ledger state.
  await loadDagHeads(datastorePath);

  appContext.attestation = await createAndSetAttestation(node, wallet);
  node.setHeadProvider(() => appContext.dagHeads.length > 0 ? appContext.dagHeads[appContext.dagHeads.length - 1] : null);
  appContext.wallet.sign = (data) => wallet.privateKey.sign(data);

  appContext.gc = new GarbageCollector({
    blockstore: appContext.node.blockstore,
    heliaJson: appContext.j,
    pinManager: appContext.pinManager,
  });
  logger.info('Core: Garbage collector initialized.');

  appContext.replicationManager = new ReplicationManager({
    libp2p: appContext.node.libp2p,
    pinManager: appContext.pinManager
  });
  appContext.replicationManager.start();
  logger.info('Core: Replication manager started.');

  logger.prod(`Core: Wallet ID: ${wallet.peerId.toString()}`);
  logger.prod(`Core: Node ID:   ${node.libp2p.peerId.toString()}`);

  await node.libp2p.services.pubsub.subscribe(GLOBAL_LEDGER_TOPIC);
  logger.prod(`Core: Subscribed to topic: ${GLOBAL_LEDGER_TOPIC}`);

  node.libp2p.services.pubsub.addEventListener('message', async (event) => {
    try {
      const tx = JSON.parse(new TextDecoder().decode(event.detail.data));
      logger.info(`Core: Received transaction of type ${tx.type} from network.`);

      // Basic validation
      if (!tx || !tx.author) {
        logger.warn('Core: Received invalid transaction data.');
        return;
      }

      // Prevent processing our own messages
      if (tx.author === appContext.wallet.peerId.toString()) {
        logger.info('Core: Ignoring our own broadcasted message.');
        return;
      }

      const authorPeerId = peerIdFromString(tx.author);
      const isValid = await verifyTransaction(tx, authorPeerId);

      if (!isValid) {
        logger.warn(`Core: Invalid signature for transaction from ${tx.author}. Discarding.`);
        // Optional: Penalize the sender
        // appContext.reputationManager.penalize(authorPeerId, 10);
        return;
      }

      // Add to Helia to get its CID and store it.
      const cid = await appContext.j.add(tx);
      const cidString = cid.toString();

      if (appContext.receivedMessages.includes(cidString)) {
        logger.info(`Core: Already processed transaction ${cidString}. Ignoring.`);
        return;
      }
      appContext.receivedMessages.push(cidString);

      // Update DAG heads
      appContext.dagHeads = [...appContext.dagHeads.filter(h => !tx.parents.includes(h.toString())), cid];

      logger.prod(`✅ Core: Valid transaction ${cidString} of type ${tx.type} from ${tx.author} applied to ledger.`);

      // Optional: If a UI is connected, send an update
      // if (global.frontendUpdateCallback) {
      //     global.frontendUpdateCallback(await formatTransactionForFrontend(tx, cid));
      // }

    } catch (error) {
      logger.error('Core: Error processing received message:', error);
    }
  });

  return node;
}

async function publishWithRetry(messageBytes) {
    const maxRetries = 5;
    const retryDelay = 1000; // 1 second
    for (let i = 0; i < maxRetries; i++) {
      try {
        await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, messageBytes);
        logger.info('✅ Transaction published to the network!');
        return;
      } catch (error) {
        if (error.message.includes('NoPeersSubscribedToTopic') && i < maxRetries - 1) {
          logger.warn(`Pubsub topic not ready, retrying in ${retryDelay}ms... (Attempt ${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          throw error;
        }
      }
    }
}

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
    const bonusPayload = createSetDailyBonusPayload(appContext.wallet, bonusWalletBalance, bonusDailyTransactionSum, 'Automatic Daily Bonus');

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
      appContext.dagHeads = [...appContext.dagHeads.filter(h => !bonusTransactionToSign.parents.includes(h.toString())), bonusCid];
      const bonusMessageBytes = new TextEncoder().encode(JSON.stringify(signedBonusTransaction));
      await publishWithRetry(bonusMessageBytes);
    }
  }
}

export function startTransactionQueueProcessor() {
  // Queue processing logic...
}
