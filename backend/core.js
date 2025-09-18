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

export async function startNode(wallet, datastorePath) {
  logger.info('Core: Initializing P2P node...');
  appContext.reputationManager = new ReputationManager();
  appContext.pubsubRateLimiter = new RateLimiter(0.5, 2);
  logger.info('Core: Security components initialized.');

  const node = await createNode(datastorePath, appContext.reputationManager);
  appContext.node = node;
  appContext.wallet = wallet;
  appContext.j = json(node);

  // Start the core node first, as it initializes the main datastore.
  await node.start();
  logger.prod('Core: Node started successfully');

  // Now that the main datastore is open, initialize secondary components.
  const pinDbPath = path.join(datastorePath, 'pins');
  appContext.pinManager = new PinManager(pinDbPath);
  await appContext.pinManager.open();
  logger.info('Core: Pin manager initialized.');

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
      // Message processing logic...
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
